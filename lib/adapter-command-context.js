function providers(getAdapters) {
  const services = getAdapters();
  return Array.isArray(services) ? services : services ? [services] : [];
}

function paneFor(adapter) {
  return adapter.getPaneItem?.() || null;
}

function ownerFor(adapter) {
  return adapter.getKernelOwner?.() || null;
}

function matchEditor(adapter, editor) {
  const pane = paneFor(adapter);
  if (pane?.getSourceEditor?.() === editor || pane?.sourceEditor === editor) {
    return { targetId: null };
  }
  const activeId = adapter.getActiveTargetId?.();
  const active = adapter.getKernelTarget?.(activeId) || adapter.getRunTarget?.(activeId);
  if (active?.editor === editor) return { targetId: active.id ?? activeId };

  const element = editor.element || editor.getElement?.();
  const root = adapter.getElement?.() || pane?.getElement?.() || pane?.element;
  if (element && root) {
    if (!root.contains?.(element)) return null;
    const cell = element.closest?.("[data-cell-id]");
    const targetId = cell && root.contains(cell) ? cell.getAttribute("data-cell-id") : null;
    if (targetId != null && adapter.getRunTarget?.(targetId)) return { targetId };
    return { targetId: null };
  }

  // Providers without a rendered root cannot prove ownership from the DOM.
  // The normal notebook path above needs only its active or addressed cell.
  const ids = adapter.getRunTargetIds?.("all");
  const targets = ids
    ? ids.map((id) => adapter.getRunTarget?.(id))
    : adapter.getRunTargets?.("all") || [];
  const target = targets.find((candidate) => candidate?.editor === editor);
  return target ? { targetId: target.id } : null;
}

function targetAdapter(adapter, targetId) {
  if (targetId == null) return adapter;
  if (!adapter.getRunTarget?.(targetId)) return null;
  return new Proxy(adapter, {
    get(target, property) {
      if (property === "getActiveTargetId") return () => targetId;
      if (property === "getKernelTarget") {
        return (id = targetId) => target.getKernelTarget?.(id) || target.getRunTarget?.(id) || null;
      }
      if (property === "getRunTargets") {
        return (scope = "selected") => {
          if (scope === "active") return [target.getRunTarget(targetId)].filter(Boolean);
          if (scope === "above" || scope === "below") {
            const ids = target.getRunTargetIds?.("all");
            const all = ids || (target.getRunTargets?.("all") || []).map((entry) => entry.id);
            const index = all.indexOf(targetId);
            if (index === -1) return [];
            const selected = scope === "above" ? all.slice(0, index) : all.slice(index);
            return selected.map((id) => target.getRunTarget(id)).filter(Boolean);
          }
          return target.getRunTargets?.(scope) || [];
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function scopedServices(getAdapters, adapter, targetId) {
  const owner = ownerFor(adapter);
  const pane = paneFor(adapter);
  const wrap = (candidate) =>
    candidate && ownerFor(candidate) === owner ? targetAdapter(candidate, targetId) : null;
  const forItem = (item) => {
    if (!item || item.isDestroyed?.() || owner?.isDestroyed?.()) return null;
    for (const provider of providers(getAdapters)) {
      const candidate = wrap(provider.getAdapterForItem?.(item));
      if (candidate) return candidate;
    }
    return null;
  };
  const shim = {
    getActiveAdapter() {
      if (owner?.isDestroyed?.()) return null;
      const original = forItem(pane);
      if (original) return original;
      for (const provider of providers(getAdapters)) {
        const candidate = wrap(provider.getActiveAdapter?.());
        if (candidate && !paneFor(candidate)?.isDestroyed?.()) return candidate;
      }
      for (const item of lumine.workspace.getPaneItems()) {
        const candidate = forItem(item);
        if (candidate) return candidate;
      }
      return null;
    },
    getAdapterForItem: forItem,
    handlesItem: (item) => Boolean(forItem(item)),
  };
  return () => [shim];
}

// A target editor establishes ownership; its role alone never selects a
// notebook. The services getter routes later work through current providers.
function captureCommandAdapter(getAdapters, integration, targetEditor) {
  const services = providers(getAdapters);
  const active = integration.captureAdapterKernelContext(services);
  if (!targetEditor) return active ? { services: getAdapters, context: active } : null;

  let adapter = active?.adapter;
  let match = adapter && matchEditor(adapter, targetEditor);
  if (!match) {
    adapter = null;
    for (const item of lumine.workspace.getPaneItems()) {
      if (item.isDestroyed?.()) continue;
      for (const provider of services) {
        const candidate = provider.getAdapterForItem?.(item);
        if (!candidate) continue;
        const found = matchEditor(candidate, targetEditor);
        if (!found) continue;
        adapter = candidate;
        match = found;
        break;
      }
      if (adapter) break;
    }
  }
  if (!adapter || !match) {
    const requiresOwner =
      targetEditor.isJupyterNotebookSourceEditor ||
      lumine.textEditors?.roleFor?.(targetEditor) === "fragment";
    return active && requiresOwner ? { unowned: true } : null;
  }
  const scoped = scopedServices(getAdapters, adapter, match.targetId);
  const selected = targetAdapter(adapter, match.targetId);
  const context = selected && integration.captureAdapterKernelContext(scoped(), selected);
  return context ? { services: scoped, context } : { unowned: true };
}

module.exports = { captureCommandAdapter };
