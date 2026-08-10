/** @jsx etch.dom */
/**
 * HTML output that also handles Altair/Vega HTML: the spec is extracted and
 * handed to the native Vega renderer, avoiding the inline script the content
 * security policy would block.
 */
const etch = require("@lumine-code/etch");
const { VegaEmbed } = require("./vega");

function extractBalancedJSON(str, startIndex, startChar = "{") {
  const endChar = startChar === "{" ? "}" : "]";
  if (str[startIndex] !== startChar) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\" && inString) {
      escape = true;
      continue;
    }

    if (char === '"' && !escape) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === startChar) depth++;
      else if (char === endChar) {
        depth--;
        if (depth === 0) {
          return str.substring(startIndex, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * Try to extract Vega/Vega-Lite spec from Altair HTML output
 */
function extractVegaSpec(html) {
  // Method 1: Altair IIFE pattern - spec is passed as first argument at the end
  // Pattern: })({"config": ..., "$schema": "...vega..."}, embedOpt);
  // Look for })({ which starts the spec argument
  const iifePattern = /\}\)\s*\(\s*\{/g;
  let match;
  while ((match = iifePattern.exec(html)) !== null) {
    const startIndex = match.index + match[0].length - 1; // Position of the opening {
    const specStr = extractBalancedJSON(html, startIndex);
    if (specStr) {
      try {
        const spec = JSON.parse(specStr);
        // Verify it looks like a Vega spec
        if (
          spec.$schema ||
          spec.mark ||
          spec.data ||
          spec.layer ||
          spec.vconcat ||
          spec.hconcat ||
          spec.config
        ) {
          return spec;
        }
      } catch (e) {
        // JSON parse failed, continue searching
      }
    }
  }

  // Method 2: Find vegaEmbed call and extract the spec object
  const vegaEmbedIndex = html.indexOf("vegaEmbed(");
  if (vegaEmbedIndex !== -1) {
    // Find the opening brace of the spec (second argument after the selector)
    const afterVegaEmbed = html.substring(vegaEmbedIndex);
    // Skip past the first argument (selector string)
    const commaIndex = afterVegaEmbed.indexOf(",");
    if (commaIndex !== -1) {
      const afterComma = afterVegaEmbed.substring(commaIndex + 1);
      const braceIndex = afterComma.indexOf("{");
      if (braceIndex !== -1) {
        const specStr = extractBalancedJSON(afterComma, braceIndex);
        if (specStr) {
          try {
            const spec = JSON.parse(specStr);
            if (
              spec.$schema ||
              spec.mark ||
              spec.data ||
              spec.layer ||
              spec.vconcat ||
              spec.hconcat
            ) {
              return spec;
            }
          } catch (e) {
            // JSON parse failed
          }
        }
      }
    }
  }

  // Method 3: Try to find spec in a script tag with type application/json
  const jsonScriptMatch = html.match(
    /<script[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (jsonScriptMatch) {
    try {
      return JSON.parse(jsonScriptMatch[1]);
    } catch (e) {
      // JSON parse failed
    }
  }

  // Method 4: Look for var spec = {...} or let spec = {...} or const spec = {...}
  const specVarMatch = html.match(/(?:var|let|const)\s+spec\s*=\s*/);
  if (specVarMatch) {
    const startIndex = html.indexOf(specVarMatch[0]) + specVarMatch[0].length;
    const braceIndex = html.indexOf("{", startIndex);
    if (braceIndex !== -1 && braceIndex - startIndex < 10) {
      // Allow some whitespace
      const specStr = extractBalancedJSON(html, braceIndex);
      if (specStr) {
        try {
          return JSON.parse(specStr);
        } catch (e) {
          // JSON parse failed
        }
      }
    }
  }

  // Method 5: Look for any large JSON object that looks like a Vega spec (by $schema)
  const schemaMatch = html.match(
    /\{\s*"[^"]*"\s*:\s*\{[^}]*\}[^}]*"\$schema"\s*:\s*"[^"]*vega[^"]*"/,
  );
  if (schemaMatch) {
    // Find the start of this JSON object
    const schemaIndex = html.indexOf('"$schema"');
    if (schemaIndex !== -1) {
      // Search backwards for the opening brace
      let braceCount = 0;
      let startIndex = schemaIndex;
      for (let i = schemaIndex; i >= 0; i--) {
        if (html[i] === "}") braceCount++;
        else if (html[i] === "{") {
          if (braceCount === 0) {
            startIndex = i;
            break;
          }
          braceCount--;
        }
      }
      const specStr = extractBalancedJSON(html, startIndex);
      if (specStr) {
        try {
          return JSON.parse(specStr);
        } catch (e) {
          // JSON parse failed
        }
      }
    }
  }

  return null;
}

/**
 * Detect Vega/Vega-Lite version from spec
 */
function detectMediaType(spec) {
  if (!spec || !spec.$schema) {
    // Default to latest vega-lite if no schema
    if (spec && (spec.mark || spec.layer || spec.hconcat || spec.vconcat)) {
      return "application/vnd.vegalite.v5+json";
    }
    return null;
  }

  const schema = spec.$schema.toLowerCase();

  // Check for Vega-Lite
  if (schema.includes("vega-lite")) {
    if (schema.includes("/v6")) return "application/vnd.vegalite.v5+json";
    if (schema.includes("/v5")) return "application/vnd.vegalite.v5+json";
    if (schema.includes("/v4")) return "application/vnd.vegalite.v4+json";
    if (schema.includes("/v3")) return "application/vnd.vegalite.v3+json";
    if (schema.includes("/v2")) return "application/vnd.vegalite.v2+json";
    if (schema.includes("/v1")) return "application/vnd.vegalite.v1+json";
    return "application/vnd.vegalite.v5+json";
  }

  // Check for Vega
  if (schema.includes("vega")) {
    if (schema.includes("/v6")) return "application/vnd.vega.v5+json";
    if (schema.includes("/v5")) return "application/vnd.vega.v5+json";
    if (schema.includes("/v4")) return "application/vnd.vega.v4+json";
    if (schema.includes("/v3")) return "application/vnd.vega.v3+json";
    if (schema.includes("/v2")) return "application/vnd.vega.v2+json";
    return "application/vnd.vega.v5+json";
  }

  return null;
}

/**
 * Check if HTML contains Vega/Altair content
 */
function isVegaHTML(html) {
  return (
    html.includes("vegaEmbed") ||
    html.includes("vega-embed") ||
    html.includes("vega-lite") ||
    html.includes("application/vnd.vega")
  );
}

/**
 * Safe HTML component that handles Vega/Altair content specially
 * by extracting specs and rendering with native Vega renderer.
 * For Plotly, users should use the native notebook renderer (not sphinx_gallery).
 */

/**
 * Renders HTML output, but recognises the Vega/Altair case and re-renders it
 * through the native Vega embedder instead: the HTML those libraries emit
 * drives itself from an inline script, which the content security policy
 * blocks. Everything else is injected with its script tags stripped.
 */
class HTML {
  constructor(props) {
    this.props = props;
    this.vegaSpec = null;
    this.vegaMediaType = null;
    this.processHTML(this.props.data);
    etch.initialize(this);
  }

  processHTML(html) {
    this.vegaSpec = null;
    this.vegaMediaType = null;
    if (!html || !isVegaHTML(html)) {
      return;
    }
    const spec = extractVegaSpec(html);
    if (!spec) {
      return;
    }
    const mediaType = detectMediaType(spec);
    if (mediaType) {
      this.vegaSpec = spec;
      this.vegaMediaType = mediaType;
    }
  }

  render() {
    // The root element must keep its identity across updates: an enclosing
    // etch tree records it, and this component's re-render can run outside
    // that tree's patch pass (another package's copy of etch drives it), so a
    // root swap would leave the enclosing tree pointing at a removed node.
    // Both branches therefore share one root and differ only in its child.
    // innerHTML lives on the child, never the root: children are patched
    // before props, so alternating innerHTML and element children on one node
    // would wipe a just-inserted child when the property is cleared.
    if (this.vegaSpec && this.vegaMediaType) {
      return (
        <div className="output-html">
          <VegaEmbed mediaType={this.vegaMediaType} spec={this.vegaSpec} />
        </div>
      );
    }

    // Scripts are stripped: this content is injected as-is.
    const sanitized =
      typeof this.props.data === "string"
        ? this.props.data.replace(/<script[\s\S]*?<\/script>/gi, "")
        : "";
    return (
      <div className="output-html">
        <div innerHTML={sanitized} />
      </div>
    );
  }

  update(props) {
    if (props.data === this.props.data) {
      this.props = props;
      return Promise.resolve();
    }
    this.props = props;
    this.processHTML(props.data);
    return etch.update(this);
  }

  destroy() {
    return etch.destroy(this);
  }
}

const htmlRenderer = (data) => <HTML data={data} />;

module.exports = { HTML, htmlRenderer };
