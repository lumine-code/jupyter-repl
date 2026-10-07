/**
 * Own adapter document identities, path observation and integration generations.
 * Pane items and adapter wrappers are replaceable views of a stable owner.
 */
class AdapterDocumentRegistry {
  unsavedItemKeys = new WeakMap();
  ownerKeys = new WeakMap();
  ownerSubscriptions = new WeakMap();
  subscriptions = new Set();
  destroyedOwners = new WeakSet();
  nextUnsavedItemId = 1;
  active = false;
  generation = 0;

  constructor(ports) {
    this.ports = ports;
    this.store = ports.store;
  }

  ownerIsDestroyed(owner) {
    return Boolean(owner && this.destroyedOwners.has(owner)) || Boolean(owner?.isDestroyed?.());
  }

  activate() {
    this.active = true;
    this.generation++;
  }

  deactivate() {
    this.active = false;
    this.generation++;
  }

  detachObservers() {
    const subscriptions = this.subscriptions;
    this.subscriptions = new Set();
    for (const subscription of subscriptions) subscription.detach?.();
    return subscriptions;
  }

  disposeObservers(subscriptions = this.detachObservers()) {
    for (const subscription of subscriptions) subscription.dispose?.();
  }

  getActiveAdapter(adapterServices) {
    const services = Array.isArray(adapterServices)
      ? adapterServices
      : adapterServices
        ? [adapterServices]
        : [];
    const activeItem = this.ports.workspace().getCenter().getActivePaneItem();

    for (const service of services) {
      const adapter = service.getAdapterForItem?.(activeItem) || service.getActiveAdapter?.();
      if (adapter) {
        this.observeAdapterPath(adapter);
        return adapter;
      }
    }

    return null;
  }

  getAdapterOwner(adapter) {
    return adapter.getKernelOwner?.() || null;
  }

  getAdapterServices(adapterServices) {
    return Array.isArray(adapterServices)
      ? adapterServices
      : adapterServices
        ? [adapterServices]
        : [];
  }

  getAdapterKey(adapter) {
    const owner = this.getAdapterOwner(adapter);
    const adapterId = adapter.getAdapterId?.();
    const path = adapter.getPath?.() || owner?.getPath?.();
    if (path) {
      const previousKey = owner && typeof owner === "object" ? this.ownerKeys.get(owner) : null;
      if (previousKey && previousKey !== path) {
        this.store.remapKernelKey(previousKey, path);
      }
      if (owner && typeof owner === "object") this.ownerKeys.set(owner, path);
      return path;
    }

    if (owner && typeof owner === "object") {
      if (!this.unsavedItemKeys.has(owner)) {
        const ownerId = owner.id == null ? null : `Jupyter Adapter ${owner.id}`;
        this.unsavedItemKeys.set(
          owner,
          ownerId || adapterId || `Unsaved Adapter ${this.nextUnsavedItemId++}`,
        );
      }
      const key = this.ownerKeys.get(owner) || this.unsavedItemKeys.get(owner);
      this.ownerKeys.set(owner, key);
      return key;
    }

    if (adapterId) return adapterId;

    return `Unsaved Adapter ${this.nextUnsavedItemId++}`;
  }

  observeAdapterPath(adapter) {
    const paneItem = adapter.getPaneItem?.();
    const owner = this.getAdapterOwner(adapter);
    if (
      !this.active ||
      !owner ||
      typeof owner !== "object" ||
      this.ownerIsDestroyed(owner) ||
      this.ownerSubscriptions.has(owner)
    )
      return;

    const pathSubscriber =
      (typeof owner.onDidChangePath === "function" && owner) ||
      (typeof adapter.onDidChangePath === "function" && adapter) ||
      (typeof paneItem?.onDidChangePath === "function" && paneItem) ||
      null;
    const disposables = [];
    const generation = this.generation;
    let disposed = false;
    const subscription = {
      detach: () => {
        if (this.ownerSubscriptions.get(owner) === subscription) {
          this.ownerSubscriptions.delete(owner);
          this.ownerKeys.delete(owner);
        }
        this.subscriptions.delete(subscription);
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        subscription.detach();
        for (const disposable of disposables) disposable?.dispose?.();
      },
    };
    this.ownerSubscriptions.set(owner, subscription);
    this.subscriptions.add(subscription);
    const isCurrent = () =>
      this.active &&
      this.generation === generation &&
      this.ownerSubscriptions.get(owner) === subscription;

    this.ownerKeys.set(owner, this.getAdapterKey(adapter));
    if (pathSubscriber) {
      disposables.push(
        pathSubscriber.onDidChangePath((newPath) => {
          if (!isCurrent()) return;
          const pathOwner =
            typeof owner.getPath === "function"
              ? owner
              : typeof adapter.getPath === "function"
                ? adapter
                : null;
          if (pathOwner && (pathOwner.getPath() || null) !== (newPath || null)) return;
          let nextKey = newPath;
          if (!nextKey) {
            if (!this.unsavedItemKeys.has(owner)) {
              const ownerId = owner.id == null ? null : `Jupyter Adapter ${owner.id}`;
              this.unsavedItemKeys.set(
                owner,
                ownerId ||
                  adapter.getAdapterId?.() ||
                  `Unsaved Adapter ${this.nextUnsavedItemId++}`,
              );
            }
            nextKey = this.unsavedItemKeys.get(owner);
          }
          const previousKey = this.ownerKeys.get(owner);
          if (previousKey && previousKey !== nextKey) {
            this.store.remapKernelKey(previousKey, nextKey);
          }
          this.ownerKeys.set(owner, nextKey);
        }),
      );
    }

    const destroySubscriber =
      (typeof owner.onDidDestroy === "function" && owner) ||
      (typeof paneItem?.onDidDestroy === "function" && paneItem) ||
      null;
    if (destroySubscriber) {
      disposables.push(
        destroySubscriber.onDidDestroy(() => {
          if (!isCurrent()) return;
          this.destroyedOwners.add(owner);
          const key = this.ownerKeys.get(owner);
          const kernel = this.getMappedKernel(key);
          subscription.detach();
          this.ports.onDocumentClosed({ adapter, owner, key, kernel });
          subscription.dispose();
        }),
      );
    }
  }

  getAdapterTitle(adapter, paneItem, filePath) {
    return (
      adapter.getTitle?.() ||
      paneItem?.getTitle?.() ||
      (filePath ? String(filePath).split(/[\\/]/).pop() : "")
    );
  }

  getAdapterContext(adapter) {
    const paneItem = adapter.getPaneItem?.() || null;
    const filePath = this.getAdapterKey(adapter);
    return {
      filePath,
      title: this.getAdapterTitle(adapter, paneItem, filePath),
      paneItem,
      owner: this.getAdapterOwner(adapter),
    };
  }

  getMappedKernel(filePath) {
    if (!filePath) return null;
    return this.store.kernelMapping.get(filePath) || null;
  }

  captureAdapterKernelContext(adapterService, explicitAdapter = null) {
    if (!this.active) return null;
    const adapter = explicitAdapter || this.getActiveAdapter(adapterService);
    if (!adapter) return null;
    this.observeAdapterPath(adapter);
    const owner = this.getAdapterOwner(adapter);
    if (!owner) return null;
    const target = this.getAdapterKernelTarget(adapter);
    const context = this.getAdapterContext(adapter);
    return {
      ...context,
      adapter,
      target,
      editor: target?.editor || null,
      grammar: this.ports.getKernelGrammar(adapter),
      adapterServices: this.getAdapterServices(adapterService),
      integrationGeneration: this.generation,
    };
  }

  refreshAdapterKernelContext(context) {
    if (!context || context.integrationGeneration !== this.generation) return null;
    const owner = context.owner;
    if (!owner || owner.isDestroyed?.() || this.destroyedOwners.has(owner)) return null;

    const candidates = [context.paneItem, ...this.ports.workspace().getPaneItems()].filter(
      (item, index, items) => item && !item.isDestroyed?.() && items.indexOf(item) === index,
    );
    for (const item of candidates) {
      for (const service of context.adapterServices || []) {
        const adapter = service.getAdapterForItem?.(item);
        if (adapter && this.getAdapterOwner(adapter) === owner) {
          this.observeAdapterPath(adapter);
          const target = this.getAdapterKernelTarget(adapter);
          return {
            ...context,
            ...this.getAdapterContext(adapter),
            adapter,
            target,
            editor: target?.editor && !target.editor.isDestroyed?.() ? target.editor : null,
            grammar: this.ports.getKernelGrammar(adapter),
          };
        }
      }
    }

    // Test adapters and non-enumerating providers may not expose
    // getAdapterForItem. They are still usable while their captured pane lives.
    if (!context.paneItem?.isDestroyed?.() && this.getAdapterOwner(context.adapter) === owner) {
      const target = this.getAdapterKernelTarget(context.adapter);
      return {
        ...context,
        target,
        editor: target?.editor && !target.editor.isDestroyed?.() ? target.editor : null,
      };
    }
    return null;
  }

  adapterContextIsAlive(context) {
    if (context?.requestIsCurrent && !context.requestIsCurrent()) return false;
    if (!this.active || context?.integrationGeneration !== this.generation) {
      return false;
    }
    const owner = context?.owner;
    const paneItem = context?.paneItem;
    if (context?.adapter && this.getAdapterOwner(context.adapter) !== owner) return false;
    if (owner && typeof owner === "object" && this.destroyedOwners.has(owner)) return false;
    if (owner?.isDestroyed?.()) return false;
    if (owner && owner !== paneItem) return true;
    return !paneItem?.isDestroyed?.();
  }

  getAdapterKernelTarget(adapter) {
    const activeTargetId = adapter.getActiveTargetId?.();
    return (
      adapter.getKernelTarget?.(activeTargetId) ||
      adapter.getRunTarget?.(activeTargetId) ||
      adapter.getRunTargets?.("all")?.[0] ||
      null
    );
  }
}

module.exports = AdapterDocumentRegistry;
