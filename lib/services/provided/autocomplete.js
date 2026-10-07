const { log, char_idx_to_js_idx } = require("../../utils");
const { Disposable, CompositeDisposable } = require("lumine");
let Anser;
const iconHTML = `<img src='${__dirname}/../../../assets/logo.svg' style='width: 100%;'>`;
const regexes = {
  // pretty dodgy, adapted from http://stackoverflow.com/a/8396658
  r: /([^\W\d]|\.)[\w$.]*$/,
  // adapted from http://stackoverflow.com/q/5474008
  python: /([^\W\d]|[\u00A0-\uFFFF])[\w.\u00A0-\uFFFF]*$/,
  // adapted from http://php.net/manual/en/language.variables.basics.php
  php: /[$A-Z_a-z\x7f-\xff][\w\x7f-\xff]*$/,
};

/**
 * Find where a completion text should be inserted using pattern matching.
 * This is a fallback when cursor positions are unreliable or unavailable.
 *
 * @param {String} prefix - The text before the cursor
 * @param {String} completionText - The completion text to insert
 * @returns {Object|null} - Object with {start, end} positions, or null if not found
 */
function findCompletionPosition(prefix, completionText) {
  if (!prefix || !completionText) {
    return null;
  }

  // Try to find a common suffix between the prefix and completion text
  // This handles cases where the kernel returns the full identifier
  let commonSuffixLen = 0;
  const minLen = Math.min(prefix.length, completionText.length);

  for (let i = 1; i <= minLen; i++) {
    if (prefix[prefix.length - i] === completionText[completionText.length - i]) {
      commonSuffixLen = i;
    } else {
      break;
    }
  }

  if (commonSuffixLen > 0) {
    return {
      start: prefix.length - commonSuffixLen,
      end: prefix.length,
    };
  }

  // If no common suffix, try to find word boundary using identifier pattern
  // Match characters that are typically part of identifiers: letters, digits, underscore, dot
  const wordBoundaryMatch = prefix.match(/[\w.]+$/);
  if (wordBoundaryMatch && wordBoundaryMatch.index !== undefined) {
    return {
      start: wordBoundaryMatch.index,
      end: prefix.length,
    };
  }

  // Default: insert at end (no replacement)
  return {
    start: prefix.length,
    end: prefix.length,
  };
}

function parseCompletions(results, prefix) {
  // Guard against missing or invalid results
  if (!results) {
    return [];
  }

  const { matches, metadata } = results;

  // Guard against missing matches array
  if (!matches || !Array.isArray(matches)) {
    return [];
  }

  // Convert cursor positions from character indices to JS string indices
  // This now properly handles Unicode characters including emoji and combining chars
  let cursor_start = results.cursor_start;
  let cursor_end = results.cursor_end;

  if (cursor_start !== undefined && cursor_end !== undefined) {
    cursor_start = char_idx_to_js_idx(cursor_start, prefix);
    cursor_end = char_idx_to_js_idx(cursor_end, prefix);

    // Validate the converted indices
    if (
      cursor_start < 0 ||
      cursor_end < 0 ||
      cursor_start > prefix.length ||
      cursor_end > prefix.length ||
      cursor_start > cursor_end
    ) {
      log("autocompleteProvider: invalid cursor positions after conversion:", {
        original: { start: results.cursor_start, end: results.cursor_end },
        converted: { start: cursor_start, end: cursor_end },
        prefix_length: prefix.length,
      });
      // Reset to undefined to trigger fallback
      cursor_start = undefined;
      cursor_end = undefined;
    }
  }

  if (metadata && metadata._jupyter_types_experimental) {
    const comps = metadata._jupyter_types_experimental;

    if (comps.length > 0 && comps[0].text) {
      return comps.map((match) => {
        const text = match.text;
        let start = cursor_start;
        let end = cursor_end;

        // If we have explicit start/end from the match, use and convert those
        if (match.start !== undefined && match.end !== undefined) {
          start = char_idx_to_js_idx(match.start, prefix);
          end = char_idx_to_js_idx(match.end, prefix);

          // Validate match-specific positions
          if (start < 0 || end < 0 || start > prefix.length || end > prefix.length || start > end) {
            log("autocompleteProvider: invalid match positions, using fallback");
            start = undefined;
            end = undefined;
          }
        }

        // If cursor positions are unavailable or invalid, use regex fallback
        if (start === undefined || end === undefined) {
          const fallbackPos = findCompletionPosition(prefix, text);
          if (fallbackPos) {
            start = fallbackPos.start;
            end = fallbackPos.end;
            log("autocompleteProvider: using regex fallback positions:", fallbackPos);
          } else {
            // Ultimate fallback: insert at end
            start = prefix.length;
            end = prefix.length;
          }
        }

        const replacementPrefix = prefix.slice(start, end);
        const replacedText = prefix.slice(0, start) + text;
        const type = match.type;

        return {
          text,
          replacementPrefix,
          replacedText,
          iconHTML: !type || type === "<unknown>" ? iconHTML : undefined,
          type,
        };
      });
    }
  }

  // Fallback for simple matches without metadata
  // Use regex fallback if cursor positions are unavailable
  if (cursor_start === undefined || cursor_end === undefined) {
    return matches.map((match) => {
      const text = match;
      const fallbackPos = findCompletionPosition(prefix, text);
      const start = fallbackPos?.start ?? prefix.length;
      const end = fallbackPos?.end ?? prefix.length;

      const replacementPrefix = prefix.slice(start, end);
      const replacedText = prefix.slice(0, start) + text;

      return {
        text,
        replacementPrefix,
        replacedText,
        iconHTML,
      };
    });
  }

  const replacementPrefix = prefix.slice(cursor_start, cursor_end);
  return matches.map((match) => {
    const text = match;
    const replacedText = prefix.slice(0, cursor_start) + text;
    return {
      text,
      replacementPrefix,
      replacedText,
      iconHTML,
    };
  });
}

function provideAutocomplete(store, { getKernelForEditor }) {
  let disposed = false;
  const pendingRequests = new Map();
  const completionRequests = new WeakMap();
  const suggestionContexts = new WeakMap();
  let detailsRequest = null;
  const ready = (session) =>
    Boolean(
      session &&
      !session.isDestroyed() &&
      session.connectionState === "ready" &&
      session.executionState === "idle",
    );
  const current = (context) =>
    !disposed &&
    !context.signal?.aborted &&
    !context.editor.isDestroyed?.() &&
    ready(context.session) &&
    (!context.sourceCurrent || context.sourceCurrent()) &&
    context.session.generation === context.generation &&
    getKernelForEditor(context.editor) === context.session;
  const cancelRequests = () => {
    for (const handle of pendingRequests.keys()) handle.dispose();
    detailsRequest = null;
  };
  const invalidateBindings = () => {
    for (const [handle, context] of pendingRequests) if (!current(context)) handle.dispose();
  };

  function request(context, descriptor, transform) {
    let handle;
    const subscriptions = new CompositeDisposable();
    try {
      const { session, editor, signal } = context;
      handle = session.request({ ...descriptor, purpose: "query", timeoutMs: 1000, signal });
      pendingRequests.set(handle, context);
      subscriptions.add(
        session.onDidChangeExecutionState((state) => {
          if (state !== "idle") handle.dispose();
        }),
        session.onDidChangeConnectionState((state) => {
          if (state !== "ready") handle.dispose();
        }),
        session.onDidChangeGeneration(() => handle.dispose()),
        session.onDidDestroy(() => handle.dispose()),
      );
      if (editor.onDidDestroy) subscriptions.add(editor.onDidDestroy(() => handle.dispose()));
      const changed = () => {
        if (!current(context)) handle.dispose();
      };
      if (editor.onDidChange) subscriptions.add(editor.onDidChange(changed));
      if (editor.onDidChangeCursorPosition)
        subscriptions.add(editor.onDidChangeCursorPosition(changed));
      const element = editor.element || editor.getElement?.();
      if (element)
        for (const item of lumine.workspace.getPaneItems()) {
          const root = item.getElement?.() || item.element;
          if (item !== editor && root?.contains?.(element) && item.onDidChangeJupyterKernel)
            subscriptions.add(item.onDidChangeJupyterKernel(invalidateBindings));
        }
      const promise = handle.done
        .then((outcome) => {
          if (outcome.status !== "ok" || !current(context)) return null;
          try {
            return transform(outcome.data);
          } catch (error) {
            log("autocompleteProvider: invalid kernel response:", error);
            return null;
          }
        })
        .finally(() => {
          pendingRequests.delete(handle);
          subscriptions.dispose();
          handle.dispose();
        });
      return { promise, cancel: () => handle.dispose() };
    } catch (error) {
      handle?.dispose();
      subscriptions.dispose();
      if (handle) pendingRequests.delete(handle);
      log("autocompleteProvider: request failed:", error);
      return { promise: Promise.resolve(null), cancel() {} };
    }
  }

  const autocompleteProvider = {
    enabled: lumine.config.get("jupyter-repl.autocomplete"),
    scopeSelector: ".source",
    disableForScopeSelector: ".comment",
    // The built-in provider has an inclusion priority of 0.
    inclusionPriority: 1,
    // Live-runtime tier by default, the top of the ladder: these names come
    // from asking the running kernel what actually exists, which no provider
    // reading the source can match. The rank costs the tiers below it nothing
    // — `getSuggestions` returns null unless a kernel is attached and idle.
    // See "Ranking" in autocomplete's `docs/autocomplete.provider.md`.
    suggestionPriority: lumine.config.get("jupyter-repl.autocompleteSuggestionPriority"),
    // It won't suppress providers with lower priority.
    excludeLowerPriority: false,
    suggestionDetailsEnabled: lumine.config.get("jupyter-repl.showInspectorResultsInAutocomplete"),

    // Required: Return a promise, an array of suggestions, or null.
    getSuggestions({ editor, bufferPosition, prefix, signal }) {
      completionRequests.get(editor)?.cancel();
      if (disposed || !this.enabled || editor.isDestroyed?.()) {
        return null;
      }
      // executionState is kernel-wide, and that is the right gate here: a
      // completion queued behind anyone's running cell — this editor's or a
      // console's — is answered only after that cell, by which time it is
      // stale. Withhold rather than queue.
      const kernel = getKernelForEditor(editor);
      if (!ready(kernel) || signal?.aborted) {
        return null;
      }
      const line = editor.getTextInBufferRange([[bufferPosition.row, 0], bufferPosition]);
      const regex = regexes[kernel.language];

      if (regex) {
        prefix = line.match(regex)?.[0] || "";
      } else {
        prefix = line;
      }

      // return if cursor is at whitespace
      if (prefix.trimRight().length < prefix.length) {
        return null;
      }
      let minimumWordLength = lumine.config.get("autocomplete.minimumWordLength");

      if (typeof minimumWordLength !== "number") {
        minimumWordLength = 3;
      }

      if (prefix.trim().length < minimumWordLength) {
        return null;
      }
      log("autocompleteProvider: request:", line, bufferPosition, prefix);
      const context = { editor, session: kernel, generation: kernel.generation, signal };
      context.sourceCurrent = () => {
        const position = editor.getCursorBufferPosition?.();
        return (
          (!position ||
            (position.row === bufferPosition.row && position.column === bufferPosition.column)) &&
          editor.getTextInBufferRange([[bufferPosition.row, 0], bufferPosition]) === line
        );
      };
      const completion = request(context, { type: "complete", code: prefix }, (results) => {
        if (!current(context)) return null;
        const currentPosition = editor.getCursorBufferPosition?.();
        if (
          currentPosition &&
          (currentPosition.row !== bufferPosition.row ||
            currentPosition.column !== bufferPosition.column)
        )
          return null;
        if (editor.getTextInBufferRange([[bufferPosition.row, 0], bufferPosition]) !== line) {
          return null;
        }
        const suggestions = parseCompletions(results, prefix);
        for (const suggestion of suggestions) suggestionContexts.set(suggestion, context);
        return suggestions;
      });
      completionRequests.set(editor, completion);
      return completion.promise.finally(() => {
        if (completionRequests.get(editor) === completion) completionRequests.delete(editor);
      });
    },

    getSuggestionDetailsOnSelect(suggestion) {
      detailsRequest?.cancel();
      const context = suggestionContexts.get(suggestion);
      if (disposed || !this.suggestionDetailsEnabled || !context || !current(context)) return null;
      const { text, replacementPrefix, replacedText, iconHTML, type } = suggestion;
      detailsRequest = request(
        context,
        { type: "inspect", code: replacedText, cursorPos: replacedText.length },
        ({ found, data } = {}) => {
          if (!current(context) || !found || typeof data?.["text/plain"] !== "string") return null;
          Anser ||= require("anser");
          const detailed = {
            text,
            replacementPrefix,
            replacedText,
            iconHTML,
            type,
            description: Anser.ansiToText(data["text/plain"]),
          };
          suggestionContexts.set(detailed, context);
          return detailed;
        },
      );
      return detailsRequest.promise;
    },

    timeout() {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(null);
        }, 1000);
      });
    },
    cancelSuggestions(editor) {
      completionRequests.get(editor)?.cancel();
    },
    cancelDetails() {
      detailsRequest?.cancel();
      detailsRequest = null;
    },
  };
  if (store.onDidChangeCurrentKernel) {
    store.subscriptions.add(store.onDidChangeCurrentKernel(invalidateBindings));
  }
  if (store.onDidChangeKernels)
    store.subscriptions.add(store.onDidChangeKernels(invalidateBindings));
  store.subscriptions.add(
    new Disposable(() => {
      disposed = true;
      cancelRequests();
    }),
    lumine.config.observe("jupyter-repl.autocomplete", (v) => {
      autocompleteProvider.enabled = v;
      if (!v) cancelRequests();
    }),
    lumine.config.observe("jupyter-repl.autocompleteSuggestionPriority", (v) => {
      autocompleteProvider.suggestionPriority = v;
    }),
    lumine.config.observe("jupyter-repl.showInspectorResultsInAutocomplete", (v) => {
      autocompleteProvider.suggestionDetailsEnabled = v;
      if (!v) autocompleteProvider.cancelDetails();
    }),
  );
  return autocompleteProvider;
}

module.exports = {
  provideAutocomplete,
};
