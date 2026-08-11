// GENERATED FILE — do not edit. Rebuild with `npm run build:widgets`.
// See script/build-widgets.js for why this is bundled at all.
// Built from:
//   @jupyter-widgets/base@6.0.11
//   @jupyter-widgets/base-manager@1.0.12
//   @jupyter-widgets/controls@5.0.12
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/lodash/_listCacheClear.js
var require_listCacheClear = __commonJS({
  "node_modules/lodash/_listCacheClear.js"(exports, module2) {
    function listCacheClear() {
      this.__data__ = [];
      this.size = 0;
    }
    module2.exports = listCacheClear;
  }
});

// node_modules/lodash/eq.js
var require_eq = __commonJS({
  "node_modules/lodash/eq.js"(exports, module2) {
    function eq(value, other) {
      return value === other || value !== value && other !== other;
    }
    module2.exports = eq;
  }
});

// node_modules/lodash/_assocIndexOf.js
var require_assocIndexOf = __commonJS({
  "node_modules/lodash/_assocIndexOf.js"(exports, module2) {
    var eq = require_eq();
    function assocIndexOf(array, key) {
      var length = array.length;
      while (length--) {
        if (eq(array[length][0], key)) {
          return length;
        }
      }
      return -1;
    }
    module2.exports = assocIndexOf;
  }
});

// node_modules/lodash/_listCacheDelete.js
var require_listCacheDelete = __commonJS({
  "node_modules/lodash/_listCacheDelete.js"(exports, module2) {
    var assocIndexOf = require_assocIndexOf();
    var arrayProto = Array.prototype;
    var splice = arrayProto.splice;
    function listCacheDelete(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        return false;
      }
      var lastIndex = data.length - 1;
      if (index == lastIndex) {
        data.pop();
      } else {
        splice.call(data, index, 1);
      }
      --this.size;
      return true;
    }
    module2.exports = listCacheDelete;
  }
});

// node_modules/lodash/_listCacheGet.js
var require_listCacheGet = __commonJS({
  "node_modules/lodash/_listCacheGet.js"(exports, module2) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheGet(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      return index < 0 ? void 0 : data[index][1];
    }
    module2.exports = listCacheGet;
  }
});

// node_modules/lodash/_listCacheHas.js
var require_listCacheHas = __commonJS({
  "node_modules/lodash/_listCacheHas.js"(exports, module2) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheHas(key) {
      return assocIndexOf(this.__data__, key) > -1;
    }
    module2.exports = listCacheHas;
  }
});

// node_modules/lodash/_listCacheSet.js
var require_listCacheSet = __commonJS({
  "node_modules/lodash/_listCacheSet.js"(exports, module2) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheSet(key, value) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        ++this.size;
        data.push([key, value]);
      } else {
        data[index][1] = value;
      }
      return this;
    }
    module2.exports = listCacheSet;
  }
});

// node_modules/lodash/_ListCache.js
var require_ListCache = __commonJS({
  "node_modules/lodash/_ListCache.js"(exports, module2) {
    var listCacheClear = require_listCacheClear();
    var listCacheDelete = require_listCacheDelete();
    var listCacheGet = require_listCacheGet();
    var listCacheHas = require_listCacheHas();
    var listCacheSet = require_listCacheSet();
    function ListCache(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    ListCache.prototype.clear = listCacheClear;
    ListCache.prototype["delete"] = listCacheDelete;
    ListCache.prototype.get = listCacheGet;
    ListCache.prototype.has = listCacheHas;
    ListCache.prototype.set = listCacheSet;
    module2.exports = ListCache;
  }
});

// node_modules/lodash/_stackClear.js
var require_stackClear = __commonJS({
  "node_modules/lodash/_stackClear.js"(exports, module2) {
    var ListCache = require_ListCache();
    function stackClear() {
      this.__data__ = new ListCache();
      this.size = 0;
    }
    module2.exports = stackClear;
  }
});

// node_modules/lodash/_stackDelete.js
var require_stackDelete = __commonJS({
  "node_modules/lodash/_stackDelete.js"(exports, module2) {
    function stackDelete(key) {
      var data = this.__data__, result = data["delete"](key);
      this.size = data.size;
      return result;
    }
    module2.exports = stackDelete;
  }
});

// node_modules/lodash/_stackGet.js
var require_stackGet = __commonJS({
  "node_modules/lodash/_stackGet.js"(exports, module2) {
    function stackGet(key) {
      return this.__data__.get(key);
    }
    module2.exports = stackGet;
  }
});

// node_modules/lodash/_stackHas.js
var require_stackHas = __commonJS({
  "node_modules/lodash/_stackHas.js"(exports, module2) {
    function stackHas(key) {
      return this.__data__.has(key);
    }
    module2.exports = stackHas;
  }
});

// node_modules/lodash/_freeGlobal.js
var require_freeGlobal = __commonJS({
  "node_modules/lodash/_freeGlobal.js"(exports, module2) {
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    module2.exports = freeGlobal;
  }
});

// node_modules/lodash/_root.js
var require_root = __commonJS({
  "node_modules/lodash/_root.js"(exports, module2) {
    var freeGlobal = require_freeGlobal();
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    module2.exports = root;
  }
});

// node_modules/lodash/_Symbol.js
var require_Symbol = __commonJS({
  "node_modules/lodash/_Symbol.js"(exports, module2) {
    var root = require_root();
    var Symbol2 = root.Symbol;
    module2.exports = Symbol2;
  }
});

// node_modules/lodash/_getRawTag.js
var require_getRawTag = __commonJS({
  "node_modules/lodash/_getRawTag.js"(exports, module2) {
    var Symbol2 = require_Symbol();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var nativeObjectToString = objectProto.toString;
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    function getRawTag(value) {
      var isOwn = hasOwnProperty.call(value, symToStringTag), tag = value[symToStringTag];
      try {
        value[symToStringTag] = void 0;
        var unmasked = true;
      } catch (e) {
      }
      var result = nativeObjectToString.call(value);
      if (unmasked) {
        if (isOwn) {
          value[symToStringTag] = tag;
        } else {
          delete value[symToStringTag];
        }
      }
      return result;
    }
    module2.exports = getRawTag;
  }
});

// node_modules/lodash/_objectToString.js
var require_objectToString = __commonJS({
  "node_modules/lodash/_objectToString.js"(exports, module2) {
    var objectProto = Object.prototype;
    var nativeObjectToString = objectProto.toString;
    function objectToString(value) {
      return nativeObjectToString.call(value);
    }
    module2.exports = objectToString;
  }
});

// node_modules/lodash/_baseGetTag.js
var require_baseGetTag = __commonJS({
  "node_modules/lodash/_baseGetTag.js"(exports, module2) {
    var Symbol2 = require_Symbol();
    var getRawTag = require_getRawTag();
    var objectToString = require_objectToString();
    var nullTag = "[object Null]";
    var undefinedTag = "[object Undefined]";
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    function baseGetTag(value) {
      if (value == null) {
        return value === void 0 ? undefinedTag : nullTag;
      }
      return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
    }
    module2.exports = baseGetTag;
  }
});

// node_modules/lodash/isObject.js
var require_isObject = __commonJS({
  "node_modules/lodash/isObject.js"(exports, module2) {
    function isObject2(value) {
      var type = typeof value;
      return value != null && (type == "object" || type == "function");
    }
    module2.exports = isObject2;
  }
});

// node_modules/lodash/isFunction.js
var require_isFunction = __commonJS({
  "node_modules/lodash/isFunction.js"(exports, module2) {
    var baseGetTag = require_baseGetTag();
    var isObject2 = require_isObject();
    var asyncTag = "[object AsyncFunction]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var proxyTag = "[object Proxy]";
    function isFunction(value) {
      if (!isObject2(value)) {
        return false;
      }
      var tag = baseGetTag(value);
      return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
    }
    module2.exports = isFunction;
  }
});

// node_modules/lodash/_coreJsData.js
var require_coreJsData = __commonJS({
  "node_modules/lodash/_coreJsData.js"(exports, module2) {
    var root = require_root();
    var coreJsData = root["__core-js_shared__"];
    module2.exports = coreJsData;
  }
});

// node_modules/lodash/_isMasked.js
var require_isMasked = __commonJS({
  "node_modules/lodash/_isMasked.js"(exports, module2) {
    var coreJsData = require_coreJsData();
    var maskSrcKey = (function() {
      var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
      return uid ? "Symbol(src)_1." + uid : "";
    })();
    function isMasked(func) {
      return !!maskSrcKey && maskSrcKey in func;
    }
    module2.exports = isMasked;
  }
});

// node_modules/lodash/_toSource.js
var require_toSource = __commonJS({
  "node_modules/lodash/_toSource.js"(exports, module2) {
    var funcProto = Function.prototype;
    var funcToString = funcProto.toString;
    function toSource(func) {
      if (func != null) {
        try {
          return funcToString.call(func);
        } catch (e) {
        }
        try {
          return func + "";
        } catch (e) {
        }
      }
      return "";
    }
    module2.exports = toSource;
  }
});

// node_modules/lodash/_baseIsNative.js
var require_baseIsNative = __commonJS({
  "node_modules/lodash/_baseIsNative.js"(exports, module2) {
    var isFunction = require_isFunction();
    var isMasked = require_isMasked();
    var isObject2 = require_isObject();
    var toSource = require_toSource();
    var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    var reIsHostCtor = /^\[object .+?Constructor\]$/;
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var reIsNative = RegExp(
      "^" + funcToString.call(hasOwnProperty).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    );
    function baseIsNative(value) {
      if (!isObject2(value) || isMasked(value)) {
        return false;
      }
      var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
      return pattern.test(toSource(value));
    }
    module2.exports = baseIsNative;
  }
});

// node_modules/lodash/_getValue.js
var require_getValue = __commonJS({
  "node_modules/lodash/_getValue.js"(exports, module2) {
    function getValue(object, key) {
      return object == null ? void 0 : object[key];
    }
    module2.exports = getValue;
  }
});

// node_modules/lodash/_getNative.js
var require_getNative = __commonJS({
  "node_modules/lodash/_getNative.js"(exports, module2) {
    var baseIsNative = require_baseIsNative();
    var getValue = require_getValue();
    function getNative(object, key) {
      var value = getValue(object, key);
      return baseIsNative(value) ? value : void 0;
    }
    module2.exports = getNative;
  }
});

// node_modules/lodash/_Map.js
var require_Map = __commonJS({
  "node_modules/lodash/_Map.js"(exports, module2) {
    var getNative = require_getNative();
    var root = require_root();
    var Map2 = getNative(root, "Map");
    module2.exports = Map2;
  }
});

// node_modules/lodash/_nativeCreate.js
var require_nativeCreate = __commonJS({
  "node_modules/lodash/_nativeCreate.js"(exports, module2) {
    var getNative = require_getNative();
    var nativeCreate = getNative(Object, "create");
    module2.exports = nativeCreate;
  }
});

// node_modules/lodash/_hashClear.js
var require_hashClear = __commonJS({
  "node_modules/lodash/_hashClear.js"(exports, module2) {
    var nativeCreate = require_nativeCreate();
    function hashClear() {
      this.__data__ = nativeCreate ? nativeCreate(null) : {};
      this.size = 0;
    }
    module2.exports = hashClear;
  }
});

// node_modules/lodash/_hashDelete.js
var require_hashDelete = __commonJS({
  "node_modules/lodash/_hashDelete.js"(exports, module2) {
    function hashDelete(key) {
      var result = this.has(key) && delete this.__data__[key];
      this.size -= result ? 1 : 0;
      return result;
    }
    module2.exports = hashDelete;
  }
});

// node_modules/lodash/_hashGet.js
var require_hashGet = __commonJS({
  "node_modules/lodash/_hashGet.js"(exports, module2) {
    var nativeCreate = require_nativeCreate();
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function hashGet(key) {
      var data = this.__data__;
      if (nativeCreate) {
        var result = data[key];
        return result === HASH_UNDEFINED ? void 0 : result;
      }
      return hasOwnProperty.call(data, key) ? data[key] : void 0;
    }
    module2.exports = hashGet;
  }
});

// node_modules/lodash/_hashHas.js
var require_hashHas = __commonJS({
  "node_modules/lodash/_hashHas.js"(exports, module2) {
    var nativeCreate = require_nativeCreate();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function hashHas(key) {
      var data = this.__data__;
      return nativeCreate ? data[key] !== void 0 : hasOwnProperty.call(data, key);
    }
    module2.exports = hashHas;
  }
});

// node_modules/lodash/_hashSet.js
var require_hashSet = __commonJS({
  "node_modules/lodash/_hashSet.js"(exports, module2) {
    var nativeCreate = require_nativeCreate();
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    function hashSet(key, value) {
      var data = this.__data__;
      this.size += this.has(key) ? 0 : 1;
      data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED : value;
      return this;
    }
    module2.exports = hashSet;
  }
});

// node_modules/lodash/_Hash.js
var require_Hash = __commonJS({
  "node_modules/lodash/_Hash.js"(exports, module2) {
    var hashClear = require_hashClear();
    var hashDelete = require_hashDelete();
    var hashGet = require_hashGet();
    var hashHas = require_hashHas();
    var hashSet = require_hashSet();
    function Hash(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    Hash.prototype.clear = hashClear;
    Hash.prototype["delete"] = hashDelete;
    Hash.prototype.get = hashGet;
    Hash.prototype.has = hashHas;
    Hash.prototype.set = hashSet;
    module2.exports = Hash;
  }
});

// node_modules/lodash/_mapCacheClear.js
var require_mapCacheClear = __commonJS({
  "node_modules/lodash/_mapCacheClear.js"(exports, module2) {
    var Hash = require_Hash();
    var ListCache = require_ListCache();
    var Map2 = require_Map();
    function mapCacheClear() {
      this.size = 0;
      this.__data__ = {
        "hash": new Hash(),
        "map": new (Map2 || ListCache)(),
        "string": new Hash()
      };
    }
    module2.exports = mapCacheClear;
  }
});

// node_modules/lodash/_isKeyable.js
var require_isKeyable = __commonJS({
  "node_modules/lodash/_isKeyable.js"(exports, module2) {
    function isKeyable(value) {
      var type = typeof value;
      return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
    }
    module2.exports = isKeyable;
  }
});

// node_modules/lodash/_getMapData.js
var require_getMapData = __commonJS({
  "node_modules/lodash/_getMapData.js"(exports, module2) {
    var isKeyable = require_isKeyable();
    function getMapData(map, key) {
      var data = map.__data__;
      return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
    }
    module2.exports = getMapData;
  }
});

// node_modules/lodash/_mapCacheDelete.js
var require_mapCacheDelete = __commonJS({
  "node_modules/lodash/_mapCacheDelete.js"(exports, module2) {
    var getMapData = require_getMapData();
    function mapCacheDelete(key) {
      var result = getMapData(this, key)["delete"](key);
      this.size -= result ? 1 : 0;
      return result;
    }
    module2.exports = mapCacheDelete;
  }
});

// node_modules/lodash/_mapCacheGet.js
var require_mapCacheGet = __commonJS({
  "node_modules/lodash/_mapCacheGet.js"(exports, module2) {
    var getMapData = require_getMapData();
    function mapCacheGet(key) {
      return getMapData(this, key).get(key);
    }
    module2.exports = mapCacheGet;
  }
});

// node_modules/lodash/_mapCacheHas.js
var require_mapCacheHas = __commonJS({
  "node_modules/lodash/_mapCacheHas.js"(exports, module2) {
    var getMapData = require_getMapData();
    function mapCacheHas(key) {
      return getMapData(this, key).has(key);
    }
    module2.exports = mapCacheHas;
  }
});

// node_modules/lodash/_mapCacheSet.js
var require_mapCacheSet = __commonJS({
  "node_modules/lodash/_mapCacheSet.js"(exports, module2) {
    var getMapData = require_getMapData();
    function mapCacheSet(key, value) {
      var data = getMapData(this, key), size = data.size;
      data.set(key, value);
      this.size += data.size == size ? 0 : 1;
      return this;
    }
    module2.exports = mapCacheSet;
  }
});

// node_modules/lodash/_MapCache.js
var require_MapCache = __commonJS({
  "node_modules/lodash/_MapCache.js"(exports, module2) {
    var mapCacheClear = require_mapCacheClear();
    var mapCacheDelete = require_mapCacheDelete();
    var mapCacheGet = require_mapCacheGet();
    var mapCacheHas = require_mapCacheHas();
    var mapCacheSet = require_mapCacheSet();
    function MapCache(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    MapCache.prototype.clear = mapCacheClear;
    MapCache.prototype["delete"] = mapCacheDelete;
    MapCache.prototype.get = mapCacheGet;
    MapCache.prototype.has = mapCacheHas;
    MapCache.prototype.set = mapCacheSet;
    module2.exports = MapCache;
  }
});

// node_modules/lodash/_stackSet.js
var require_stackSet = __commonJS({
  "node_modules/lodash/_stackSet.js"(exports, module2) {
    var ListCache = require_ListCache();
    var Map2 = require_Map();
    var MapCache = require_MapCache();
    var LARGE_ARRAY_SIZE = 200;
    function stackSet(key, value) {
      var data = this.__data__;
      if (data instanceof ListCache) {
        var pairs = data.__data__;
        if (!Map2 || pairs.length < LARGE_ARRAY_SIZE - 1) {
          pairs.push([key, value]);
          this.size = ++data.size;
          return this;
        }
        data = this.__data__ = new MapCache(pairs);
      }
      data.set(key, value);
      this.size = data.size;
      return this;
    }
    module2.exports = stackSet;
  }
});

// node_modules/lodash/_Stack.js
var require_Stack = __commonJS({
  "node_modules/lodash/_Stack.js"(exports, module2) {
    var ListCache = require_ListCache();
    var stackClear = require_stackClear();
    var stackDelete = require_stackDelete();
    var stackGet = require_stackGet();
    var stackHas = require_stackHas();
    var stackSet = require_stackSet();
    function Stack(entries) {
      var data = this.__data__ = new ListCache(entries);
      this.size = data.size;
    }
    Stack.prototype.clear = stackClear;
    Stack.prototype["delete"] = stackDelete;
    Stack.prototype.get = stackGet;
    Stack.prototype.has = stackHas;
    Stack.prototype.set = stackSet;
    module2.exports = Stack;
  }
});

// node_modules/lodash/_setCacheAdd.js
var require_setCacheAdd = __commonJS({
  "node_modules/lodash/_setCacheAdd.js"(exports, module2) {
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    function setCacheAdd(value) {
      this.__data__.set(value, HASH_UNDEFINED);
      return this;
    }
    module2.exports = setCacheAdd;
  }
});

// node_modules/lodash/_setCacheHas.js
var require_setCacheHas = __commonJS({
  "node_modules/lodash/_setCacheHas.js"(exports, module2) {
    function setCacheHas(value) {
      return this.__data__.has(value);
    }
    module2.exports = setCacheHas;
  }
});

// node_modules/lodash/_SetCache.js
var require_SetCache = __commonJS({
  "node_modules/lodash/_SetCache.js"(exports, module2) {
    var MapCache = require_MapCache();
    var setCacheAdd = require_setCacheAdd();
    var setCacheHas = require_setCacheHas();
    function SetCache(values) {
      var index = -1, length = values == null ? 0 : values.length;
      this.__data__ = new MapCache();
      while (++index < length) {
        this.add(values[index]);
      }
    }
    SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
    SetCache.prototype.has = setCacheHas;
    module2.exports = SetCache;
  }
});

// node_modules/lodash/_arraySome.js
var require_arraySome = __commonJS({
  "node_modules/lodash/_arraySome.js"(exports, module2) {
    function arraySome(array, predicate) {
      var index = -1, length = array == null ? 0 : array.length;
      while (++index < length) {
        if (predicate(array[index], index, array)) {
          return true;
        }
      }
      return false;
    }
    module2.exports = arraySome;
  }
});

// node_modules/lodash/_cacheHas.js
var require_cacheHas = __commonJS({
  "node_modules/lodash/_cacheHas.js"(exports, module2) {
    function cacheHas(cache, key) {
      return cache.has(key);
    }
    module2.exports = cacheHas;
  }
});

// node_modules/lodash/_equalArrays.js
var require_equalArrays = __commonJS({
  "node_modules/lodash/_equalArrays.js"(exports, module2) {
    var SetCache = require_SetCache();
    var arraySome = require_arraySome();
    var cacheHas = require_cacheHas();
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG, arrLength = array.length, othLength = other.length;
      if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
        return false;
      }
      var arrStacked = stack.get(array);
      var othStacked = stack.get(other);
      if (arrStacked && othStacked) {
        return arrStacked == other && othStacked == array;
      }
      var index = -1, result = true, seen = bitmask & COMPARE_UNORDERED_FLAG ? new SetCache() : void 0;
      stack.set(array, other);
      stack.set(other, array);
      while (++index < arrLength) {
        var arrValue = array[index], othValue = other[index];
        if (customizer) {
          var compared = isPartial ? customizer(othValue, arrValue, index, other, array, stack) : customizer(arrValue, othValue, index, array, other, stack);
        }
        if (compared !== void 0) {
          if (compared) {
            continue;
          }
          result = false;
          break;
        }
        if (seen) {
          if (!arraySome(other, function(othValue2, othIndex) {
            if (!cacheHas(seen, othIndex) && (arrValue === othValue2 || equalFunc(arrValue, othValue2, bitmask, customizer, stack))) {
              return seen.push(othIndex);
            }
          })) {
            result = false;
            break;
          }
        } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
          result = false;
          break;
        }
      }
      stack["delete"](array);
      stack["delete"](other);
      return result;
    }
    module2.exports = equalArrays;
  }
});

// node_modules/lodash/_Uint8Array.js
var require_Uint8Array = __commonJS({
  "node_modules/lodash/_Uint8Array.js"(exports, module2) {
    var root = require_root();
    var Uint8Array2 = root.Uint8Array;
    module2.exports = Uint8Array2;
  }
});

// node_modules/lodash/_mapToArray.js
var require_mapToArray = __commonJS({
  "node_modules/lodash/_mapToArray.js"(exports, module2) {
    function mapToArray(map) {
      var index = -1, result = Array(map.size);
      map.forEach(function(value, key) {
        result[++index] = [key, value];
      });
      return result;
    }
    module2.exports = mapToArray;
  }
});

// node_modules/lodash/_setToArray.js
var require_setToArray = __commonJS({
  "node_modules/lodash/_setToArray.js"(exports, module2) {
    function setToArray(set2) {
      var index = -1, result = Array(set2.size);
      set2.forEach(function(value) {
        result[++index] = value;
      });
      return result;
    }
    module2.exports = setToArray;
  }
});

// node_modules/lodash/_equalByTag.js
var require_equalByTag = __commonJS({
  "node_modules/lodash/_equalByTag.js"(exports, module2) {
    var Symbol2 = require_Symbol();
    var Uint8Array2 = require_Uint8Array();
    var eq = require_eq();
    var equalArrays = require_equalArrays();
    var mapToArray = require_mapToArray();
    var setToArray = require_setToArray();
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var symbolTag = "[object Symbol]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolValueOf = symbolProto ? symbolProto.valueOf : void 0;
    function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
      switch (tag) {
        case dataViewTag:
          if (object.byteLength != other.byteLength || object.byteOffset != other.byteOffset) {
            return false;
          }
          object = object.buffer;
          other = other.buffer;
        case arrayBufferTag:
          if (object.byteLength != other.byteLength || !equalFunc(new Uint8Array2(object), new Uint8Array2(other))) {
            return false;
          }
          return true;
        case boolTag:
        case dateTag:
        case numberTag:
          return eq(+object, +other);
        case errorTag:
          return object.name == other.name && object.message == other.message;
        case regexpTag:
        case stringTag:
          return object == other + "";
        case mapTag:
          var convert = mapToArray;
        case setTag:
          var isPartial = bitmask & COMPARE_PARTIAL_FLAG;
          convert || (convert = setToArray);
          if (object.size != other.size && !isPartial) {
            return false;
          }
          var stacked = stack.get(object);
          if (stacked) {
            return stacked == other;
          }
          bitmask |= COMPARE_UNORDERED_FLAG;
          stack.set(object, other);
          var result = equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
          stack["delete"](object);
          return result;
        case symbolTag:
          if (symbolValueOf) {
            return symbolValueOf.call(object) == symbolValueOf.call(other);
          }
      }
      return false;
    }
    module2.exports = equalByTag;
  }
});

// node_modules/lodash/_arrayPush.js
var require_arrayPush = __commonJS({
  "node_modules/lodash/_arrayPush.js"(exports, module2) {
    function arrayPush(array, values) {
      var index = -1, length = values.length, offset = array.length;
      while (++index < length) {
        array[offset + index] = values[index];
      }
      return array;
    }
    module2.exports = arrayPush;
  }
});

// node_modules/lodash/isArray.js
var require_isArray = __commonJS({
  "node_modules/lodash/isArray.js"(exports, module2) {
    var isArray = Array.isArray;
    module2.exports = isArray;
  }
});

// node_modules/lodash/_baseGetAllKeys.js
var require_baseGetAllKeys = __commonJS({
  "node_modules/lodash/_baseGetAllKeys.js"(exports, module2) {
    var arrayPush = require_arrayPush();
    var isArray = require_isArray();
    function baseGetAllKeys(object, keysFunc, symbolsFunc) {
      var result = keysFunc(object);
      return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
    }
    module2.exports = baseGetAllKeys;
  }
});

// node_modules/lodash/_arrayFilter.js
var require_arrayFilter = __commonJS({
  "node_modules/lodash/_arrayFilter.js"(exports, module2) {
    function arrayFilter(array, predicate) {
      var index = -1, length = array == null ? 0 : array.length, resIndex = 0, result = [];
      while (++index < length) {
        var value = array[index];
        if (predicate(value, index, array)) {
          result[resIndex++] = value;
        }
      }
      return result;
    }
    module2.exports = arrayFilter;
  }
});

// node_modules/lodash/stubArray.js
var require_stubArray = __commonJS({
  "node_modules/lodash/stubArray.js"(exports, module2) {
    function stubArray() {
      return [];
    }
    module2.exports = stubArray;
  }
});

// node_modules/lodash/_getSymbols.js
var require_getSymbols = __commonJS({
  "node_modules/lodash/_getSymbols.js"(exports, module2) {
    var arrayFilter = require_arrayFilter();
    var stubArray = require_stubArray();
    var objectProto = Object.prototype;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var nativeGetSymbols = Object.getOwnPropertySymbols;
    var getSymbols = !nativeGetSymbols ? stubArray : function(object) {
      if (object == null) {
        return [];
      }
      object = Object(object);
      return arrayFilter(nativeGetSymbols(object), function(symbol) {
        return propertyIsEnumerable.call(object, symbol);
      });
    };
    module2.exports = getSymbols;
  }
});

// node_modules/lodash/_baseTimes.js
var require_baseTimes = __commonJS({
  "node_modules/lodash/_baseTimes.js"(exports, module2) {
    function baseTimes(n, iteratee) {
      var index = -1, result = Array(n);
      while (++index < n) {
        result[index] = iteratee(index);
      }
      return result;
    }
    module2.exports = baseTimes;
  }
});

// node_modules/lodash/isObjectLike.js
var require_isObjectLike = __commonJS({
  "node_modules/lodash/isObjectLike.js"(exports, module2) {
    function isObjectLike(value) {
      return value != null && typeof value == "object";
    }
    module2.exports = isObjectLike;
  }
});

// node_modules/lodash/_baseIsArguments.js
var require_baseIsArguments = __commonJS({
  "node_modules/lodash/_baseIsArguments.js"(exports, module2) {
    var baseGetTag = require_baseGetTag();
    var isObjectLike = require_isObjectLike();
    var argsTag = "[object Arguments]";
    function baseIsArguments(value) {
      return isObjectLike(value) && baseGetTag(value) == argsTag;
    }
    module2.exports = baseIsArguments;
  }
});

// node_modules/lodash/isArguments.js
var require_isArguments = __commonJS({
  "node_modules/lodash/isArguments.js"(exports, module2) {
    var baseIsArguments = require_baseIsArguments();
    var isObjectLike = require_isObjectLike();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var isArguments = baseIsArguments(/* @__PURE__ */ (function() {
      return arguments;
    })()) ? baseIsArguments : function(value) {
      return isObjectLike(value) && hasOwnProperty.call(value, "callee") && !propertyIsEnumerable.call(value, "callee");
    };
    module2.exports = isArguments;
  }
});

// node_modules/lodash/stubFalse.js
var require_stubFalse = __commonJS({
  "node_modules/lodash/stubFalse.js"(exports, module2) {
    function stubFalse() {
      return false;
    }
    module2.exports = stubFalse;
  }
});

// node_modules/lodash/isBuffer.js
var require_isBuffer = __commonJS({
  "node_modules/lodash/isBuffer.js"(exports, module2) {
    var root = require_root();
    var stubFalse = require_stubFalse();
    var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
    var freeModule = freeExports && typeof module2 == "object" && module2 && !module2.nodeType && module2;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var Buffer2 = moduleExports ? root.Buffer : void 0;
    var nativeIsBuffer = Buffer2 ? Buffer2.isBuffer : void 0;
    var isBuffer = nativeIsBuffer || stubFalse;
    module2.exports = isBuffer;
  }
});

// node_modules/lodash/_isIndex.js
var require_isIndex = __commonJS({
  "node_modules/lodash/_isIndex.js"(exports, module2) {
    var MAX_SAFE_INTEGER = 9007199254740991;
    var reIsUint = /^(?:0|[1-9]\d*)$/;
    function isIndex(value, length) {
      var type = typeof value;
      length = length == null ? MAX_SAFE_INTEGER : length;
      return !!length && (type == "number" || type != "symbol" && reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
    }
    module2.exports = isIndex;
  }
});

// node_modules/lodash/isLength.js
var require_isLength = __commonJS({
  "node_modules/lodash/isLength.js"(exports, module2) {
    var MAX_SAFE_INTEGER = 9007199254740991;
    function isLength(value) {
      return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
    }
    module2.exports = isLength;
  }
});

// node_modules/lodash/_baseIsTypedArray.js
var require_baseIsTypedArray = __commonJS({
  "node_modules/lodash/_baseIsTypedArray.js"(exports, module2) {
    var baseGetTag = require_baseGetTag();
    var isLength = require_isLength();
    var isObjectLike = require_isObjectLike();
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var funcTag = "[object Function]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var objectTag = "[object Object]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var weakMapTag = "[object WeakMap]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var float32Tag = "[object Float32Array]";
    var float64Tag = "[object Float64Array]";
    var int8Tag = "[object Int8Array]";
    var int16Tag = "[object Int16Array]";
    var int32Tag = "[object Int32Array]";
    var uint8Tag = "[object Uint8Array]";
    var uint8ClampedTag = "[object Uint8ClampedArray]";
    var uint16Tag = "[object Uint16Array]";
    var uint32Tag = "[object Uint32Array]";
    var typedArrayTags = {};
    typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
    typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dataViewTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
    function baseIsTypedArray(value) {
      return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
    }
    module2.exports = baseIsTypedArray;
  }
});

// node_modules/lodash/_baseUnary.js
var require_baseUnary = __commonJS({
  "node_modules/lodash/_baseUnary.js"(exports, module2) {
    function baseUnary(func) {
      return function(value) {
        return func(value);
      };
    }
    module2.exports = baseUnary;
  }
});

// node_modules/lodash/_nodeUtil.js
var require_nodeUtil = __commonJS({
  "node_modules/lodash/_nodeUtil.js"(exports, module2) {
    var freeGlobal = require_freeGlobal();
    var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
    var freeModule = freeExports && typeof module2 == "object" && module2 && !module2.nodeType && module2;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var freeProcess = moduleExports && freeGlobal.process;
    var nodeUtil = (function() {
      try {
        var types = freeModule && freeModule.require && freeModule.require("util").types;
        if (types) {
          return types;
        }
        return freeProcess && freeProcess.binding && freeProcess.binding("util");
      } catch (e) {
      }
    })();
    module2.exports = nodeUtil;
  }
});

// node_modules/lodash/isTypedArray.js
var require_isTypedArray = __commonJS({
  "node_modules/lodash/isTypedArray.js"(exports, module2) {
    var baseIsTypedArray = require_baseIsTypedArray();
    var baseUnary = require_baseUnary();
    var nodeUtil = require_nodeUtil();
    var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;
    var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;
    module2.exports = isTypedArray;
  }
});

// node_modules/lodash/_arrayLikeKeys.js
var require_arrayLikeKeys = __commonJS({
  "node_modules/lodash/_arrayLikeKeys.js"(exports, module2) {
    var baseTimes = require_baseTimes();
    var isArguments = require_isArguments();
    var isArray = require_isArray();
    var isBuffer = require_isBuffer();
    var isIndex = require_isIndex();
    var isTypedArray = require_isTypedArray();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function arrayLikeKeys(value, inherited) {
      var isArr = isArray(value), isArg = !isArr && isArguments(value), isBuff = !isArr && !isArg && isBuffer(value), isType = !isArr && !isArg && !isBuff && isTypedArray(value), skipIndexes = isArr || isArg || isBuff || isType, result = skipIndexes ? baseTimes(value.length, String) : [], length = result.length;
      for (var key in value) {
        if ((inherited || hasOwnProperty.call(value, key)) && !(skipIndexes && // Safari 9 has enumerable `arguments.length` in strict mode.
        (key == "length" || // Node.js 0.10 has enumerable non-index properties on buffers.
        isBuff && (key == "offset" || key == "parent") || // PhantomJS 2 has enumerable non-index properties on typed arrays.
        isType && (key == "buffer" || key == "byteLength" || key == "byteOffset") || // Skip index properties.
        isIndex(key, length)))) {
          result.push(key);
        }
      }
      return result;
    }
    module2.exports = arrayLikeKeys;
  }
});

// node_modules/lodash/_isPrototype.js
var require_isPrototype = __commonJS({
  "node_modules/lodash/_isPrototype.js"(exports, module2) {
    var objectProto = Object.prototype;
    function isPrototype(value) {
      var Ctor = value && value.constructor, proto = typeof Ctor == "function" && Ctor.prototype || objectProto;
      return value === proto;
    }
    module2.exports = isPrototype;
  }
});

// node_modules/lodash/_overArg.js
var require_overArg = __commonJS({
  "node_modules/lodash/_overArg.js"(exports, module2) {
    function overArg(func, transform) {
      return function(arg) {
        return func(transform(arg));
      };
    }
    module2.exports = overArg;
  }
});

// node_modules/lodash/_nativeKeys.js
var require_nativeKeys = __commonJS({
  "node_modules/lodash/_nativeKeys.js"(exports, module2) {
    var overArg = require_overArg();
    var nativeKeys = overArg(Object.keys, Object);
    module2.exports = nativeKeys;
  }
});

// node_modules/lodash/_baseKeys.js
var require_baseKeys = __commonJS({
  "node_modules/lodash/_baseKeys.js"(exports, module2) {
    var isPrototype = require_isPrototype();
    var nativeKeys = require_nativeKeys();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function baseKeys(object) {
      if (!isPrototype(object)) {
        return nativeKeys(object);
      }
      var result = [];
      for (var key in Object(object)) {
        if (hasOwnProperty.call(object, key) && key != "constructor") {
          result.push(key);
        }
      }
      return result;
    }
    module2.exports = baseKeys;
  }
});

// node_modules/lodash/isArrayLike.js
var require_isArrayLike = __commonJS({
  "node_modules/lodash/isArrayLike.js"(exports, module2) {
    var isFunction = require_isFunction();
    var isLength = require_isLength();
    function isArrayLike(value) {
      return value != null && isLength(value.length) && !isFunction(value);
    }
    module2.exports = isArrayLike;
  }
});

// node_modules/lodash/keys.js
var require_keys = __commonJS({
  "node_modules/lodash/keys.js"(exports, module2) {
    var arrayLikeKeys = require_arrayLikeKeys();
    var baseKeys = require_baseKeys();
    var isArrayLike = require_isArrayLike();
    function keys(object) {
      return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
    }
    module2.exports = keys;
  }
});

// node_modules/lodash/_getAllKeys.js
var require_getAllKeys = __commonJS({
  "node_modules/lodash/_getAllKeys.js"(exports, module2) {
    var baseGetAllKeys = require_baseGetAllKeys();
    var getSymbols = require_getSymbols();
    var keys = require_keys();
    function getAllKeys(object) {
      return baseGetAllKeys(object, keys, getSymbols);
    }
    module2.exports = getAllKeys;
  }
});

// node_modules/lodash/_equalObjects.js
var require_equalObjects = __commonJS({
  "node_modules/lodash/_equalObjects.js"(exports, module2) {
    var getAllKeys = require_getAllKeys();
    var COMPARE_PARTIAL_FLAG = 1;
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG, objProps = getAllKeys(object), objLength = objProps.length, othProps = getAllKeys(other), othLength = othProps.length;
      if (objLength != othLength && !isPartial) {
        return false;
      }
      var index = objLength;
      while (index--) {
        var key = objProps[index];
        if (!(isPartial ? key in other : hasOwnProperty.call(other, key))) {
          return false;
        }
      }
      var objStacked = stack.get(object);
      var othStacked = stack.get(other);
      if (objStacked && othStacked) {
        return objStacked == other && othStacked == object;
      }
      var result = true;
      stack.set(object, other);
      stack.set(other, object);
      var skipCtor = isPartial;
      while (++index < objLength) {
        key = objProps[index];
        var objValue = object[key], othValue = other[key];
        if (customizer) {
          var compared = isPartial ? customizer(othValue, objValue, key, other, object, stack) : customizer(objValue, othValue, key, object, other, stack);
        }
        if (!(compared === void 0 ? objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack) : compared)) {
          result = false;
          break;
        }
        skipCtor || (skipCtor = key == "constructor");
      }
      if (result && !skipCtor) {
        var objCtor = object.constructor, othCtor = other.constructor;
        if (objCtor != othCtor && ("constructor" in object && "constructor" in other) && !(typeof objCtor == "function" && objCtor instanceof objCtor && typeof othCtor == "function" && othCtor instanceof othCtor)) {
          result = false;
        }
      }
      stack["delete"](object);
      stack["delete"](other);
      return result;
    }
    module2.exports = equalObjects;
  }
});

// node_modules/lodash/_DataView.js
var require_DataView = __commonJS({
  "node_modules/lodash/_DataView.js"(exports, module2) {
    var getNative = require_getNative();
    var root = require_root();
    var DataView2 = getNative(root, "DataView");
    module2.exports = DataView2;
  }
});

// node_modules/lodash/_Promise.js
var require_Promise = __commonJS({
  "node_modules/lodash/_Promise.js"(exports, module2) {
    var getNative = require_getNative();
    var root = require_root();
    var Promise2 = getNative(root, "Promise");
    module2.exports = Promise2;
  }
});

// node_modules/lodash/_Set.js
var require_Set = __commonJS({
  "node_modules/lodash/_Set.js"(exports, module2) {
    var getNative = require_getNative();
    var root = require_root();
    var Set2 = getNative(root, "Set");
    module2.exports = Set2;
  }
});

// node_modules/lodash/_WeakMap.js
var require_WeakMap = __commonJS({
  "node_modules/lodash/_WeakMap.js"(exports, module2) {
    var getNative = require_getNative();
    var root = require_root();
    var WeakMap2 = getNative(root, "WeakMap");
    module2.exports = WeakMap2;
  }
});

// node_modules/lodash/_getTag.js
var require_getTag = __commonJS({
  "node_modules/lodash/_getTag.js"(exports, module2) {
    var DataView2 = require_DataView();
    var Map2 = require_Map();
    var Promise2 = require_Promise();
    var Set2 = require_Set();
    var WeakMap2 = require_WeakMap();
    var baseGetTag = require_baseGetTag();
    var toSource = require_toSource();
    var mapTag = "[object Map]";
    var objectTag = "[object Object]";
    var promiseTag = "[object Promise]";
    var setTag = "[object Set]";
    var weakMapTag = "[object WeakMap]";
    var dataViewTag = "[object DataView]";
    var dataViewCtorString = toSource(DataView2);
    var mapCtorString = toSource(Map2);
    var promiseCtorString = toSource(Promise2);
    var setCtorString = toSource(Set2);
    var weakMapCtorString = toSource(WeakMap2);
    var getTag = baseGetTag;
    if (DataView2 && getTag(new DataView2(new ArrayBuffer(1))) != dataViewTag || Map2 && getTag(new Map2()) != mapTag || Promise2 && getTag(Promise2.resolve()) != promiseTag || Set2 && getTag(new Set2()) != setTag || WeakMap2 && getTag(new WeakMap2()) != weakMapTag) {
      getTag = function(value) {
        var result = baseGetTag(value), Ctor = result == objectTag ? value.constructor : void 0, ctorString = Ctor ? toSource(Ctor) : "";
        if (ctorString) {
          switch (ctorString) {
            case dataViewCtorString:
              return dataViewTag;
            case mapCtorString:
              return mapTag;
            case promiseCtorString:
              return promiseTag;
            case setCtorString:
              return setTag;
            case weakMapCtorString:
              return weakMapTag;
          }
        }
        return result;
      };
    }
    module2.exports = getTag;
  }
});

// node_modules/lodash/_baseIsEqualDeep.js
var require_baseIsEqualDeep = __commonJS({
  "node_modules/lodash/_baseIsEqualDeep.js"(exports, module2) {
    var Stack = require_Stack();
    var equalArrays = require_equalArrays();
    var equalByTag = require_equalByTag();
    var equalObjects = require_equalObjects();
    var getTag = require_getTag();
    var isArray = require_isArray();
    var isBuffer = require_isBuffer();
    var isTypedArray = require_isTypedArray();
    var COMPARE_PARTIAL_FLAG = 1;
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var objectTag = "[object Object]";
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
      var objIsArr = isArray(object), othIsArr = isArray(other), objTag = objIsArr ? arrayTag : getTag(object), othTag = othIsArr ? arrayTag : getTag(other);
      objTag = objTag == argsTag ? objectTag : objTag;
      othTag = othTag == argsTag ? objectTag : othTag;
      var objIsObj = objTag == objectTag, othIsObj = othTag == objectTag, isSameTag = objTag == othTag;
      if (isSameTag && isBuffer(object)) {
        if (!isBuffer(other)) {
          return false;
        }
        objIsArr = true;
        objIsObj = false;
      }
      if (isSameTag && !objIsObj) {
        stack || (stack = new Stack());
        return objIsArr || isTypedArray(object) ? equalArrays(object, other, bitmask, customizer, equalFunc, stack) : equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
      }
      if (!(bitmask & COMPARE_PARTIAL_FLAG)) {
        var objIsWrapped = objIsObj && hasOwnProperty.call(object, "__wrapped__"), othIsWrapped = othIsObj && hasOwnProperty.call(other, "__wrapped__");
        if (objIsWrapped || othIsWrapped) {
          var objUnwrapped = objIsWrapped ? object.value() : object, othUnwrapped = othIsWrapped ? other.value() : other;
          stack || (stack = new Stack());
          return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
        }
      }
      if (!isSameTag) {
        return false;
      }
      stack || (stack = new Stack());
      return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
    }
    module2.exports = baseIsEqualDeep;
  }
});

// node_modules/lodash/_baseIsEqual.js
var require_baseIsEqual = __commonJS({
  "node_modules/lodash/_baseIsEqual.js"(exports, module2) {
    var baseIsEqualDeep = require_baseIsEqualDeep();
    var isObjectLike = require_isObjectLike();
    function baseIsEqual(value, other, bitmask, customizer, stack) {
      if (value === other) {
        return true;
      }
      if (value == null || other == null || !isObjectLike(value) && !isObjectLike(other)) {
        return value !== value && other !== other;
      }
      return baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual, stack);
    }
    module2.exports = baseIsEqual;
  }
});

// node_modules/lodash/isEqual.js
var require_isEqual = __commonJS({
  "node_modules/lodash/isEqual.js"(exports, module2) {
    var baseIsEqual = require_baseIsEqual();
    function isEqual2(value, other) {
      return baseIsEqual(value, other);
    }
    module2.exports = isEqual2;
  }
});

// node_modules/@jupyter-widgets/controls/package.json
var require_package = __commonJS({
  "node_modules/@jupyter-widgets/controls/package.json"(exports, module2) {
    module2.exports = {
      name: "@jupyter-widgets/controls",
      version: "5.0.12",
      description: "Jupyter interactive widgets",
      repository: {
        type: "git",
        url: "https://github.com/jupyter-widgets/ipywidgets.git"
      },
      license: "BSD-3-Clause",
      author: "Project Jupyter",
      main: "lib/index.js",
      typings: "lib/index.d.ts",
      files: [
        "lib/**/*.map",
        "lib/**/*.d.ts",
        "lib/**/*.js",
        "css/*.css",
        "dist/",
        "src"
      ],
      scripts: {
        build: "npm run build:src && npm run build:css",
        "build:css": "lessc css/nouislider.less css/nouislider.css && postcss --use postcss-import --use postcss-cssnext -o css/widgets.built.css css/widgets.css",
        "build:src": "tsc --build",
        "build:test": "tsc --build test && webpack --config test/webpack.conf.js",
        clean: "npm run clean:src",
        "clean:src": "rimraf lib && rimraf tsconfig.tsbuildinfo",
        prepublish: "npm run clean && npm run build",
        test: "npm run test:unit",
        "test:coverage": "npm run build:test && webpack --config test/webpack-cov.conf.js && karma start test/karma-cov.conf.js",
        "test:unit": "npm run test:unit:firefox && npm run test:unit:chrome",
        "test:unit:chrome": "npm run test:unit:default -- --browsers=Chrome",
        "test:unit:default": "npm run build:test && karma start test/karma.conf.js --log-level debug",
        "test:unit:firefox": "npm run test:unit:default -- --browsers=Firefox",
        "test:unit:firefox:headless": "npm run test:unit:default -- --browsers=FirefoxHeadless",
        "test:unit:ie": "npm run test:unit:default -- --browsers=IE"
      },
      dependencies: {
        "@jupyter-widgets/base": "^6.0.11",
        "@lumino/algorithm": "^1 || ^2",
        "@lumino/domutils": "^1 || ^2",
        "@lumino/messaging": "^1 || ^2",
        "@lumino/signaling": "^1 || ^2",
        "@lumino/widgets": "^1 || ^2",
        "d3-color": "^3.0.1",
        "d3-format": "^3.0.1",
        jquery: "^3.1.1",
        nouislider: "15.4.0"
      },
      devDependencies: {
        "@jupyterlab/services": "^6.0.0 || ^7.0.0",
        "@types/d3-color": "^3.0.2",
        "@types/d3-format": "^3.0.1",
        "@types/expect.js": "^0.3.29",
        "@types/jquery": "^3.5.16",
        "@types/mathjax": "^0.0.37",
        "@types/mocha": "^9.0.0",
        "@types/node": "^17.0.2",
        chai: "^4.0.0",
        "css-loader": "^6.5.1",
        "expect.js": "^0.3.1",
        "istanbul-instrumenter-loader": "^3.0.1",
        karma: "^6.3.3",
        "karma-chrome-launcher": "^3.1.0",
        "karma-coverage": "^2.0.3",
        "karma-firefox-launcher": "^2.1.1",
        "karma-ie-launcher": "^1.0.0",
        "karma-mocha": "^2.0.1",
        "karma-mocha-reporter": "^2.2.5",
        "karma-webpack": "^5.0.0",
        less: "^4.1.2",
        mocha: "^9.0.0",
        "npm-run-all": "^4.1.5",
        postcss: "^8.3.2",
        "postcss-cli": "^9.1.0",
        "postcss-cssnext": "^3.1.0",
        "postcss-import": "^14.0.2",
        "postcss-loader": "^6.1.0",
        rimraf: "^3.0.2",
        sinon: "^12.0.1",
        "sinon-chai": "^3.3.0",
        "style-loader": "^3.3.1",
        typescript: "~4.9.4",
        webpack: "^5.65.0"
      },
      gitHead: "ace1a8fe516699b06914ff59d8a26f33a6911239"
    };
  }
});

// jupyter-widgets-entry.js
var jupyter_widgets_entry_exports = {};
__export(jupyter_widgets_entry_exports, {
  base: () => lib_exports,
  baseManager: () => lib_exports2,
  controls: () => lib_exports3
});
module.exports = __toCommonJS(jupyter_widgets_entry_exports);

// node_modules/@jupyter-widgets/base/lib/index.js
var lib_exports = {};
__export(lib_exports, {
  BROKEN_FILE_SVG_ICON: () => BROKEN_FILE_SVG_ICON,
  DOMWidgetModel: () => DOMWidgetModel,
  DOMWidgetView: () => DOMWidgetView,
  ErrorWidgetView: () => ErrorWidgetView,
  IJupyterWidgetRegistry: () => IJupyterWidgetRegistry,
  JUPYTER_WIDGETS_VERSION: () => JUPYTER_WIDGETS_VERSION,
  JupyterLuminoPanelWidget: () => JupyterLuminoPanelWidget,
  JupyterLuminoWidget: () => JupyterLuminoWidget,
  JupyterPhosphorPanelWidget: () => JupyterPhosphorPanelWidget,
  JupyterPhosphorWidget: () => JupyterPhosphorWidget,
  LayoutModel: () => LayoutModel,
  LayoutView: () => LayoutView,
  PROTOCOL_VERSION: () => PROTOCOL_VERSION,
  StyleModel: () => StyleModel,
  StyleView: () => StyleView,
  ViewList: () => ViewList,
  WidgetModel: () => WidgetModel,
  WidgetView: () => WidgetView,
  assign: () => assign,
  createErrorWidgetModel: () => createErrorWidgetModel,
  createErrorWidgetView: () => createErrorWidgetView,
  difference: () => difference,
  isEqual: () => isEqual,
  isObject: () => isObject,
  isSerializable: () => isSerializable,
  pack_models: () => pack_models,
  put_buffers: () => put_buffers,
  reject: () => reject,
  remove_buffers: () => remove_buffers,
  resolvePromisesDict: () => resolvePromisesDict,
  shims: () => shims,
  unpack_models: () => unpack_models,
  uuid: () => uuid
});

// node_modules/@jupyter-widgets/base/lib/utils.js
var import_coreutils = require("@lumino/coreutils");
var import_isEqual = __toESM(require_isEqual());
function difference(a, b) {
  return a.filter((v) => b.indexOf(v) === -1);
}
function isEqual(a, b) {
  return (0, import_isEqual.default)(a, b);
}
var assign = Object.assign || function(t, ...args) {
  for (let i = 1; i < args.length; i++) {
    const s = args[i];
    for (const p in s) {
      if (Object.prototype.hasOwnProperty.call(s, p)) {
        t[p] = s[p];
      }
    }
  }
  return t;
};
function uuid() {
  return import_coreutils.UUID.uuid4();
}
function resolvePromisesDict(d) {
  const keys = Object.keys(d);
  const values = [];
  keys.forEach(function(key) {
    values.push(d[key]);
  });
  return Promise.all(values).then((v) => {
    const d2 = {};
    for (let i = 0; i < keys.length; i++) {
      d2[keys[i]] = v[i];
    }
    return d2;
  });
}
function reject(message, log) {
  return function promiseRejection(error) {
    if (log) {
      console.error(new Error(message));
    }
    throw error;
  };
}
function put_buffers(state, buffer_paths, buffers) {
  for (let i = 0; i < buffer_paths.length; i++) {
    const buffer_path = buffer_paths[i];
    let buffer = buffers[i];
    if (!(buffer instanceof DataView)) {
      buffer = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
    }
    let obj = state;
    for (let j = 0; j < buffer_path.length - 1; j++) {
      obj = obj[buffer_path[j]];
    }
    obj[buffer_path[buffer_path.length - 1]] = buffer;
  }
}
function isSerializable(object) {
  var _a;
  return (_a = typeof object === "object" && object && "toJSON" in object) !== null && _a !== void 0 ? _a : false;
}
function isObject(data) {
  return import_coreutils.JSONExt.isObject(data);
}
function remove_buffers(state) {
  const buffers = [];
  const buffer_paths = [];
  function remove(obj, path) {
    if (isSerializable(obj)) {
      obj = obj.toJSON();
    }
    if (Array.isArray(obj)) {
      let is_cloned = false;
      for (let i = 0; i < obj.length; i++) {
        const value = obj[i];
        if (value) {
          if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
            if (!is_cloned) {
              obj = obj.slice();
              is_cloned = true;
            }
            buffers.push(ArrayBuffer.isView(value) ? value.buffer : value);
            buffer_paths.push(path.concat([i]));
            obj[i] = null;
          } else {
            const new_value = remove(value, path.concat([i]));
            if (new_value !== value) {
              if (!is_cloned) {
                obj = obj.slice();
                is_cloned = true;
              }
              obj[i] = new_value;
            }
          }
        }
      }
    } else if (isObject(obj)) {
      for (const key in obj) {
        let is_cloned = false;
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          if (value) {
            if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
              if (!is_cloned) {
                obj = Object.assign({}, obj);
                is_cloned = true;
              }
              buffers.push(ArrayBuffer.isView(value) ? value.buffer : value);
              buffer_paths.push(path.concat([key]));
              delete obj[key];
            } else {
              const new_value = remove(value, path.concat([key]));
              if (new_value !== value) {
                if (!is_cloned) {
                  obj = Object.assign({}, obj);
                  is_cloned = true;
                }
                obj[key] = new_value;
              }
            }
          }
        }
      }
    }
    return obj;
  }
  const new_state = remove(state, []);
  return { state: new_state, buffers, buffer_paths };
}
var BROKEN_FILE_SVG_ICON = `<svg style="height:50%;max-height: 50px;" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
<g >
  <g transform="translate(0.24520123,0.93464292)">
    <path  d="M 8.2494641,21.074514 V 5.6225142 c 0,-0.314 0.254,-0.567 0.57,-0.567 H 29.978464 c 2.388,0 9.268,5.8269998 9.268,8.3029998 v 5.5835 l -3.585749,4.407396 -2.772971,-3.535534 -5.126524,3.414213 -5.944543,-3.237436 -5.722718,3.06066 z m 30.9969999,3.8675 v 15.5835 c 0,0.314 -0.254,0.567 -0.57,0.567 H 8.8194641 c -0.315,0.002 -0.57,-0.251 -0.57,-0.566 v -15.452 l 7.8444949,2.628449 5.656854,-2.65165 4.24264,3.005204 5.833631,-3.237437 3.712311,3.944543 z" style="fill:url(#linearGradient3448);stroke:#888a85"  />
    <path d="m 30.383464,12.110514 c 4.108,0.159 7.304,-0.978 8.867,1.446 0.304,-3.9679998 -7.254,-8.8279998 -9.285,-8.4979998 0.813,0.498 0.418,7.0519998 0.418,7.0519998 z" style="fill:url(#linearGradient3445);stroke:#868a84" />
    <path enable-background="new" d="m 31.443464,11.086514 c 2.754,-0.019 4.106,-0.49 5.702,0.19 -1.299,-1.8809998 -4.358,-3.3439998 -5.728,-4.0279998 0.188,0.775 0.026,3.8379998 0.026,3.8379998 z" style="opacity:0.36930003;fill:none;stroke:url(#linearGradient3442)" />
  </g>
</g>
</svg>`;

// node_modules/@jupyter-widgets/base/lib/backbone-patch.js
var import_coreutils2 = require("@lumino/coreutils");
function set(key, val, options) {
  if (key == null) {
    return this;
  }
  let attrs;
  if (import_coreutils2.JSONExt.isObject(key)) {
    attrs = key;
    options = val;
  } else {
    (attrs = {})[key] = val;
  }
  options || (options = {});
  if (!this._validate(attrs, options)) {
    return false;
  }
  const unset = options.unset;
  const silent = options.silent;
  const changes = [];
  const changing = this._changing;
  this._changing = true;
  try {
    if (!changing) {
      this._previousAttributes = Object.assign({}, this.attributes);
      this.changed = {};
    }
    const current = this.attributes;
    const changed = this.changed;
    const prev = this._previousAttributes;
    for (const attr in attrs) {
      val = attrs[attr];
      if (!isEqual(current[attr], val)) {
        changes.push(attr);
      }
      if (!isEqual(prev[attr], val)) {
        changed[attr] = val;
      } else {
        delete changed[attr];
      }
      unset ? delete current[attr] : current[attr] = val;
    }
    this.id = this.get(this.idAttribute);
    if (!silent) {
      if (changes.length) {
        this._pending = options;
      }
      for (let i = 0; i < changes.length; i++) {
        this.trigger("change:" + changes[i], this, current[changes[i]], options);
      }
    }
    if (changing) {
      return this;
    }
    if (!silent) {
      while (this._pending) {
        options = this._pending;
        this._pending = false;
        this.trigger("change", this, options);
      }
    }
  } finally {
    this._pending = false;
    this._changing = false;
  }
  return this;
}

// node_modules/@jupyter-widgets/base/lib/widget.js
var Backbone2 = __toESM(require("backbone"));
var import_jquery = __toESM(require("jquery"));

// node_modules/@jupyter-widgets/base/lib/nativeview.js
var Backbone = __toESM(require("backbone"));
var ElementProto = typeof Element !== "undefined" ? Element.prototype : void 0;
function matchesFallback(selector) {
  const matches = (this.document || this.ownerDocument).querySelectorAll(selector);
  let i = matches.length;
  while (--i >= 0 && matches.item(i) !== this) {
    continue;
  }
  return i > -1;
}
var matchesSelector = ElementProto ? ElementProto.matches || ElementProto["webkitMatchesSelector"] || ElementProto["mozMatchesSelector"] || ElementProto["msMatchesSelector"] || ElementProto["oMatchesSelector"] || matchesFallback : matchesFallback;
var NativeView = class extends Backbone.View {
  _removeElement() {
    this.undelegateEvents();
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
  // Apply the `element` to the view.
  _setElement(element) {
    this.el = element;
  }
  // Set a hash of attributes to the view's `el`. We use the "prop" version
  // if available, falling back to `setAttribute` for the catch-all.
  _setAttributes(attrs) {
    for (const attr in attrs) {
      attr in this.el ? this.el[attr] = attrs[attr] : this.el.setAttribute(attr, attrs[attr]);
    }
  }
  delegate(eventName, selector, listener) {
    if (typeof selector !== "string") {
      listener = selector;
      selector = null;
    }
    if (this._domEvents === void 0) {
      this._domEvents = [];
    }
    const root = this.el;
    const handler = selector ? function(e) {
      let node = e.target || e.srcElement;
      for (; node && node !== root; node = node.parentNode) {
        if (matchesSelector.call(node, selector)) {
          e.delegateTarget = node;
          if (listener.handleEvent) {
            return listener.handleEvent(e);
          } else {
            return listener(e);
          }
        }
      }
    } : listener;
    this.el.addEventListener(eventName, handler, false);
    this._domEvents.push({ eventName, handler, listener, selector });
    return handler;
  }
  undelegate(eventName, selector, listener) {
    if (typeof selector === "function") {
      listener = selector;
      selector = null;
    }
    if (this.el && this._domEvents) {
      const handlers = this._domEvents.slice();
      let i = handlers.length;
      while (i--) {
        const item = handlers[i];
        const match = item.eventName === eventName && (listener ? item.listener === listener : true) && (selector ? item.selector === selector : true);
        if (!match) {
          continue;
        }
        this.el.removeEventListener(item.eventName, item.handler, false);
        this._domEvents.splice(i, 1);
      }
    }
    return this;
  }
  // Remove all events created with `delegate` from `el`
  undelegateEvents() {
    if (this.el && this._domEvents) {
      const len = this._domEvents.length;
      for (let i = 0; i < len; i++) {
        const item = this._domEvents[i];
        this.el.removeEventListener(item.eventName, item.handler, false);
      }
      this._domEvents.length = 0;
    }
    return this;
  }
};

// node_modules/@jupyter-widgets/base/lib/widget.js
var import_coreutils5 = require("@lumino/coreutils");
var import_messaging2 = require("@lumino/messaging");

// node_modules/@lumino/widgets/dist/index.es6.js
var import_algorithm2 = require("@lumino/algorithm");
var import_coreutils4 = require("@lumino/coreutils");
var import_domutils2 = require("@lumino/domutils");
var import_messaging = require("@lumino/messaging");
var import_properties = require("@lumino/properties");
var import_signaling2 = require("@lumino/signaling");

// node_modules/@lumino/dragdrop/dist/index.es6.js
var import_disposable = require("@lumino/disposable");
var Drag = class _Drag {
  /**
   * Construct a new drag object.
   *
   * @param options - The options for initializing the drag.
   */
  constructor(options) {
    this._onScrollFrame = () => {
      if (!this._scrollTarget) {
        return;
      }
      let { element, edge, distance } = this._scrollTarget;
      let d = Private.SCROLL_EDGE_SIZE - distance;
      let f = Math.pow(d / Private.SCROLL_EDGE_SIZE, 2);
      let s = Math.max(1, Math.round(f * Private.SCROLL_EDGE_SIZE));
      switch (edge) {
        case "top":
          element.scrollTop -= s;
          break;
        case "left":
          element.scrollLeft -= s;
          break;
        case "right":
          element.scrollLeft += s;
          break;
        case "bottom":
          element.scrollTop += s;
          break;
      }
      requestAnimationFrame(this._onScrollFrame);
    };
    this._disposed = false;
    this._dropAction = "none";
    this._override = null;
    this._currentTarget = null;
    this._currentElement = null;
    this._promise = null;
    this._scrollTarget = null;
    this._resolve = null;
    this.document = options.document || document;
    this.mimeData = options.mimeData;
    this.dragImage = options.dragImage || null;
    this.proposedAction = options.proposedAction || "copy";
    this.supportedActions = options.supportedActions || "all";
    this.source = options.source || null;
  }
  /**
   * Dispose of the resources held by the drag object.
   *
   * #### Notes
   * This will cancel the drag operation if it is active.
   */
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    if (this._currentTarget) {
      let event = new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        clientX: -1,
        clientY: -1
      });
      Private.dispatchDragLeave(this, this._currentTarget, null, event);
    }
    this._finalize("none");
  }
  /**
   * Test whether the drag object is disposed.
   */
  get isDisposed() {
    return this._disposed;
  }
  /**
   * Start the drag operation at the specified client position.
   *
   * @param clientX - The client X position for the drag start.
   *
   * @param clientY - The client Y position for the drag start.
   *
   * @returns A promise which resolves to the result of the drag.
   *
   * #### Notes
   * If the drag has already been started, the promise created by the
   * first call to `start` is returned.
   *
   * If the drag operation has ended, or if the drag object has been
   * disposed, the returned promise will resolve to `'none'`.
   *
   * The drag object will be automatically disposed when drag operation
   * completes. This means `Drag` objects are for single-use only.
   *
   * This method assumes the left mouse button is already held down.
   */
  start(clientX, clientY) {
    if (this._disposed) {
      return Promise.resolve("none");
    }
    if (this._promise) {
      return this._promise;
    }
    this._addListeners();
    this._attachDragImage(clientX, clientY);
    this._promise = new Promise((resolve) => {
      this._resolve = resolve;
    });
    let event = new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY
    });
    document.dispatchEvent(event);
    return this._promise;
  }
  /**
   * Handle the DOM events for the drag operation.
   *
   * @param event - The DOM event sent to the drag object.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the document. It should not be
   * called directly by user code.
   */
  handleEvent(event) {
    switch (event.type) {
      case "pointermove":
        this._evtPointerMove(event);
        break;
      case "pointerup":
        this._evtPointerUp(event);
        break;
      case "keydown":
        this._evtKeyDown(event);
        break;
      default:
        event.preventDefault();
        event.stopPropagation();
        break;
    }
  }
  /**
   * Move the drag image element to the specified location.
   *
   * This is a no-op if there is no drag image element.
   */
  moveDragImage(clientX, clientY) {
    if (!this.dragImage) {
      return;
    }
    let style = this.dragImage.style;
    style.transform = `translate(${clientX}px, ${clientY}px)`;
  }
  /**
   * Handle the `'pointermove'` event for the drag object.
   */
  _evtPointerMove(event) {
    event.preventDefault();
    event.stopPropagation();
    this._updateCurrentTarget(event);
    this._updateDragScroll(event);
    this.moveDragImage(event.clientX, event.clientY);
  }
  /**
   * Handle the `'pointerup'` event for the drag object.
   */
  _evtPointerUp(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0) {
      return;
    }
    this._updateCurrentTarget(event);
    if (!this._currentTarget) {
      this._finalize("none");
      return;
    }
    if (this._dropAction === "none") {
      Private.dispatchDragLeave(this, this._currentTarget, null, event);
      this._finalize("none");
      return;
    }
    let action = Private.dispatchDrop(this, this._currentTarget, event);
    this._finalize(action);
  }
  /**
   * Handle the `'keydown'` event for the drag object.
   */
  _evtKeyDown(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.keyCode === 27) {
      this.dispose();
    }
  }
  /**
   * Add the document event listeners for the drag object.
   */
  _addListeners() {
    document.addEventListener("pointerdown", this, true);
    document.addEventListener("pointermove", this, true);
    document.addEventListener("pointerup", this, true);
    document.addEventListener("pointerenter", this, true);
    document.addEventListener("pointerleave", this, true);
    document.addEventListener("pointerover", this, true);
    document.addEventListener("pointerout", this, true);
    document.addEventListener("keydown", this, true);
    document.addEventListener("keyup", this, true);
    document.addEventListener("keypress", this, true);
    document.addEventListener("contextmenu", this, true);
  }
  /**
   * Remove the document event listeners for the drag object.
   */
  _removeListeners() {
    document.removeEventListener("pointerdown", this, true);
    document.removeEventListener("pointermove", this, true);
    document.removeEventListener("pointerup", this, true);
    document.removeEventListener("pointerenter", this, true);
    document.removeEventListener("pointerleave", this, true);
    document.removeEventListener("pointerover", this, true);
    document.removeEventListener("pointerout", this, true);
    document.removeEventListener("keydown", this, true);
    document.removeEventListener("keyup", this, true);
    document.removeEventListener("keypress", this, true);
    document.removeEventListener("contextmenu", this, true);
  }
  /**
   * Update the drag scroll element under the mouse.
   */
  _updateDragScroll(event) {
    let target = Private.findScrollTarget(event);
    if (!this._scrollTarget && !target) {
      return;
    }
    if (!this._scrollTarget) {
      setTimeout(this._onScrollFrame, 500);
    }
    this._scrollTarget = target;
  }
  /**
   * Update the current target node using the given mouse event.
   */
  _updateCurrentTarget(event) {
    let prevTarget = this._currentTarget;
    let currTarget = this._currentTarget;
    let prevElem = this._currentElement;
    let currElem = Private.findElementBehindBackdrop(event, this.document);
    this._currentElement = currElem;
    if (currElem !== prevElem && currElem !== currTarget) {
      Private.dispatchDragExit(this, currTarget, currElem, event);
    }
    if (currElem !== prevElem && currElem !== currTarget) {
      currTarget = Private.dispatchDragEnter(this, currElem, currTarget, event);
    }
    if (currTarget !== prevTarget) {
      this._currentTarget = currTarget;
      Private.dispatchDragLeave(this, prevTarget, currTarget, event);
    }
    let action = Private.dispatchDragOver(this, currTarget, event);
    this._setDropAction(action);
  }
  /**
   * Attach the drag image element at the specified location.
   *
   * This is a no-op if there is no drag image element.
   */
  _attachDragImage(clientX, clientY) {
    if (!this.dragImage) {
      return;
    }
    this.dragImage.classList.add("lm-mod-drag-image");
    let style = this.dragImage.style;
    style.pointerEvents = "none";
    style.position = "fixed";
    style.transform = `translate(${clientX}px, ${clientY}px)`;
    const body = this.document instanceof Document ? this.document.body : this.document.firstElementChild;
    body.appendChild(this.dragImage);
  }
  /**
   * Detach the drag image element from the DOM.
   *
   * This is a no-op if there is no drag image element.
   */
  _detachDragImage() {
    if (!this.dragImage) {
      return;
    }
    let parent = this.dragImage.parentNode;
    if (!parent) {
      return;
    }
    parent.removeChild(this.dragImage);
  }
  /**
   * Set the internal drop action state and update the drag cursor.
   */
  _setDropAction(action) {
    action = Private.validateAction(action, this.supportedActions);
    if (this._override && this._dropAction === action) {
      return;
    }
    switch (action) {
      case "none":
        this._dropAction = action;
        this._override = _Drag.overrideCursor("no-drop", this.document);
        break;
      case "copy":
        this._dropAction = action;
        this._override = _Drag.overrideCursor("copy", this.document);
        break;
      case "link":
        this._dropAction = action;
        this._override = _Drag.overrideCursor("alias", this.document);
        break;
      case "move":
        this._dropAction = action;
        this._override = _Drag.overrideCursor("move", this.document);
        break;
    }
  }
  /**
   * Finalize the drag operation and resolve the drag promise.
   */
  _finalize(action) {
    let resolve = this._resolve;
    this._removeListeners();
    this._detachDragImage();
    if (this._override) {
      this._override.dispose();
      this._override = null;
    }
    this.mimeData.clear();
    this._disposed = true;
    this._dropAction = "none";
    this._currentTarget = null;
    this._currentElement = null;
    this._scrollTarget = null;
    this._promise = null;
    this._resolve = null;
    if (resolve) {
      resolve(action);
    }
  }
};
(function(Drag2) {
  class Event2 extends DragEvent {
    constructor(event, options) {
      super(options.type, {
        bubbles: true,
        cancelable: true,
        altKey: event.altKey,
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        detail: 0,
        metaKey: event.metaKey,
        relatedTarget: options.related,
        screenX: event.screenX,
        screenY: event.screenY,
        shiftKey: event.shiftKey,
        view: window
      });
      const { drag } = options;
      this.dropAction = "none";
      this.mimeData = drag.mimeData;
      this.proposedAction = drag.proposedAction;
      this.supportedActions = drag.supportedActions;
      this.source = drag.source;
    }
  }
  Drag2.Event = Event2;
  function overrideCursor(cursor, doc = document) {
    return Private.overrideCursor(cursor, doc);
  }
  Drag2.overrideCursor = overrideCursor;
})(Drag || (Drag = {}));
var Private;
(function(Private6) {
  Private6.SCROLL_EDGE_SIZE = 20;
  function validateAction(action, supported) {
    return actionTable[action] & supportedTable[supported] ? action : "none";
  }
  Private6.validateAction = validateAction;
  function findElementBehindBackdrop(event, root = document) {
    if (event) {
      if (lastElementEventSearch && event == lastElementEventSearch.event) {
        return lastElementEventSearch.element;
      }
      Private6.cursorBackdrop.style.zIndex = "-1000";
      const element = root.elementFromPoint(event.clientX, event.clientY);
      Private6.cursorBackdrop.style.zIndex = "";
      lastElementEventSearch = { event, element };
      return element;
    } else {
      const transform = Private6.cursorBackdrop.style.transform;
      if (lastElementSearch && transform === lastElementSearch.transform) {
        return lastElementSearch.element;
      }
      const bbox = Private6.cursorBackdrop.getBoundingClientRect();
      Private6.cursorBackdrop.style.zIndex = "-1000";
      const element = root.elementFromPoint(bbox.left + bbox.width / 2, bbox.top + bbox.height / 2);
      Private6.cursorBackdrop.style.zIndex = "";
      lastElementSearch = { transform, element };
      return element;
    }
  }
  Private6.findElementBehindBackdrop = findElementBehindBackdrop;
  let lastElementEventSearch = null;
  let lastElementSearch = null;
  function findScrollTarget(event) {
    let x = event.clientX;
    let y = event.clientY;
    let element = findElementBehindBackdrop(event);
    for (; element; element = element.parentElement) {
      if (!element.hasAttribute("data-lm-dragscroll")) {
        continue;
      }
      let offsetX = 0;
      let offsetY = 0;
      if (element === document.body) {
        offsetX = window.pageXOffset;
        offsetY = window.pageYOffset;
      }
      let r = element.getBoundingClientRect();
      let top = r.top + offsetY;
      let left = r.left + offsetX;
      let right = left + r.width;
      let bottom = top + r.height;
      if (x < left || x >= right || y < top || y >= bottom) {
        continue;
      }
      let dl = x - left + 1;
      let dt = y - top + 1;
      let dr = right - x;
      let db = bottom - y;
      let distance = Math.min(dl, dt, dr, db);
      if (distance > Private6.SCROLL_EDGE_SIZE) {
        continue;
      }
      let edge;
      switch (distance) {
        case db:
          edge = "bottom";
          break;
        case dt:
          edge = "top";
          break;
        case dr:
          edge = "right";
          break;
        case dl:
          edge = "left";
          break;
        default:
          throw "unreachable";
      }
      let dsw = element.scrollWidth - element.clientWidth;
      let dsh = element.scrollHeight - element.clientHeight;
      let shouldScroll;
      switch (edge) {
        case "top":
          shouldScroll = dsh > 0 && element.scrollTop > 0;
          break;
        case "left":
          shouldScroll = dsw > 0 && element.scrollLeft > 0;
          break;
        case "right":
          shouldScroll = dsw > 0 && element.scrollLeft < dsw;
          break;
        case "bottom":
          shouldScroll = dsh > 0 && element.scrollTop < dsh;
          break;
        default:
          throw "unreachable";
      }
      if (!shouldScroll) {
        continue;
      }
      return { element, edge, distance };
    }
    return null;
  }
  Private6.findScrollTarget = findScrollTarget;
  function dispatchDragEnter(drag, currElem, currTarget, event) {
    if (!currElem) {
      return null;
    }
    let dragEvent = new Drag.Event(event, {
      drag,
      related: currTarget,
      type: "lm-dragenter"
    });
    let canceled = !currElem.dispatchEvent(dragEvent);
    if (canceled) {
      return currElem;
    }
    const body = drag.document instanceof Document ? drag.document.body : drag.document.firstElementChild;
    if (currElem === body) {
      return currTarget;
    }
    dragEvent = new Drag.Event(event, {
      drag,
      related: currTarget,
      type: "lm-dragenter"
    });
    body.dispatchEvent(dragEvent);
    return body;
  }
  Private6.dispatchDragEnter = dispatchDragEnter;
  function dispatchDragExit(drag, prevTarget, currTarget, event) {
    if (!prevTarget) {
      return;
    }
    let dragEvent = new Drag.Event(event, {
      drag,
      related: currTarget,
      type: "lm-dragexit"
    });
    prevTarget.dispatchEvent(dragEvent);
  }
  Private6.dispatchDragExit = dispatchDragExit;
  function dispatchDragLeave(drag, prevTarget, currTarget, event) {
    if (!prevTarget) {
      return;
    }
    let dragEvent = new Drag.Event(event, {
      drag,
      related: currTarget,
      type: "lm-dragleave"
    });
    prevTarget.dispatchEvent(dragEvent);
  }
  Private6.dispatchDragLeave = dispatchDragLeave;
  function dispatchDragOver(drag, currTarget, event) {
    if (!currTarget) {
      return "none";
    }
    let dragEvent = new Drag.Event(event, {
      drag,
      related: null,
      type: "lm-dragover"
    });
    let canceled = !currTarget.dispatchEvent(dragEvent);
    if (canceled) {
      return dragEvent.dropAction;
    }
    return "none";
  }
  Private6.dispatchDragOver = dispatchDragOver;
  function dispatchDrop(drag, currTarget, event) {
    if (!currTarget) {
      return "none";
    }
    let dragEvent = new Drag.Event(event, {
      drag,
      related: null,
      type: "lm-drop"
    });
    let canceled = !currTarget.dispatchEvent(dragEvent);
    if (canceled) {
      return dragEvent.dropAction;
    }
    return "none";
  }
  Private6.dispatchDrop = dispatchDrop;
  const actionTable = {
    none: 0,
    copy: 1,
    link: 2,
    move: 4
  };
  const supportedTable = {
    none: actionTable["none"],
    copy: actionTable["copy"],
    link: actionTable["link"],
    move: actionTable["move"],
    "copy-link": actionTable["copy"] | actionTable["link"],
    "copy-move": actionTable["copy"] | actionTable["move"],
    "link-move": actionTable["link"] | actionTable["move"],
    all: actionTable["copy"] | actionTable["link"] | actionTable["move"]
  };
  function overrideCursor(cursor, doc = document) {
    let id = ++overrideCursorID;
    const body = doc instanceof Document ? doc.body : doc.firstElementChild;
    if (!Private6.cursorBackdrop.isConnected) {
      Private6.cursorBackdrop.style.transform = "scale(0)";
      body.appendChild(Private6.cursorBackdrop);
      resetBackdropScroll();
      document.addEventListener("pointermove", alignBackdrop, {
        capture: true,
        passive: true
      });
      Private6.cursorBackdrop.addEventListener("scroll", propagateBackdropScroll, {
        capture: true,
        passive: true
      });
    }
    Private6.cursorBackdrop.style.cursor = cursor;
    return new import_disposable.DisposableDelegate(() => {
      if (id === overrideCursorID && Private6.cursorBackdrop.isConnected) {
        document.removeEventListener("pointermove", alignBackdrop, true);
        Private6.cursorBackdrop.removeEventListener("scroll", propagateBackdropScroll, true);
        body.removeChild(Private6.cursorBackdrop);
      }
    });
  }
  Private6.overrideCursor = overrideCursor;
  function alignBackdrop(event) {
    if (!Private6.cursorBackdrop) {
      return;
    }
    Private6.cursorBackdrop.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    try {
      if (!Private6.cursorBackdrop.hasPointerCapture(event.pointerId)) {
        Private6.cursorBackdrop.setPointerCapture(event.pointerId);
      }
    } catch (e) {
    }
  }
  function propagateBackdropScroll(_event) {
    if (!Private6.cursorBackdrop) {
      return;
    }
    let element = findElementBehindBackdrop();
    if (!element) {
      return;
    }
    const scrollTarget = element.closest("[data-lm-dragscroll]");
    if (!scrollTarget) {
      return;
    }
    scrollTarget.scrollTop += Private6.cursorBackdrop.scrollTop - backdropScrollOrigin;
    scrollTarget.scrollLeft += Private6.cursorBackdrop.scrollLeft - backdropScrollOrigin;
    resetBackdropScroll();
  }
  function resetBackdropScroll() {
    Private6.cursorBackdrop.scrollTop = backdropScrollOrigin;
    Private6.cursorBackdrop.scrollLeft = backdropScrollOrigin;
  }
  const backdropScrollOrigin = 500;
  function createCursorBackdrop() {
    const backdrop = document.createElement("div");
    backdrop.classList.add("lm-cursor-backdrop");
    return backdrop;
  }
  let overrideCursorID = 0;
  Private6.cursorBackdrop = createCursorBackdrop();
})(Private || (Private = {}));

// node_modules/@lumino/commands/dist/index.es6.js
var import_algorithm = require("@lumino/algorithm");
var import_coreutils3 = require("@lumino/coreutils");
var import_disposable2 = require("@lumino/disposable");
var import_domutils = require("@lumino/domutils");

// node_modules/@lumino/keyboard/dist/index.es6.js
function getKeyboardLayout() {
  return Private2.keyboardLayout;
}
var KeycodeLayout = class _KeycodeLayout {
  /**
   * Construct a new keycode layout.
   *
   * @param name - The human readable name for the layout.
   *
   * @param codes - A mapping of keycode to key value.
   *
   * @param modifierKeys - Array of modifier key names
   */
  constructor(name, codes, modifierKeys = []) {
    this.name = name;
    this._codes = codes;
    this._keys = _KeycodeLayout.extractKeys(codes);
    this._modifierKeys = _KeycodeLayout.convertToKeySet(modifierKeys);
  }
  /**
   * Get an array of the key values supported by the layout.
   *
   * @returns A new array of the supported key values.
   */
  keys() {
    return Object.keys(this._keys);
  }
  /**
   * Test whether the given key is a valid value for the layout.
   *
   * @param key - The user provided key to test for validity.
   *
   * @returns `true` if the key is valid, `false` otherwise.
   */
  isValidKey(key) {
    return key in this._keys;
  }
  /**
   * Test whether the given key is a modifier key.
   *
   * @param key - The user provided key.
   *
   * @returns `true` if the key is a modifier key, `false` otherwise.
   */
  isModifierKey(key) {
    return key in this._modifierKeys;
  }
  /**
   * Get the key for a `'keydown'` event.
   *
   * @param event - The event object for a `'keydown'` event.
   *
   * @returns The associated key value, or an empty string if
   *   the event does not represent a valid primary key.
   */
  keyForKeydownEvent(event) {
    return this._codes[event.keyCode] || "";
  }
};
(function(KeycodeLayout2) {
  function extractKeys(codes) {
    let keys = /* @__PURE__ */ Object.create(null);
    for (let c in codes) {
      keys[codes[c]] = true;
    }
    return keys;
  }
  KeycodeLayout2.extractKeys = extractKeys;
  function convertToKeySet(keys) {
    let keySet = Object(null);
    for (let i = 0, n = keys.length; i < n; ++i) {
      keySet[keys[i]] = true;
    }
    return keySet;
  }
  KeycodeLayout2.convertToKeySet = convertToKeySet;
})(KeycodeLayout || (KeycodeLayout = {}));
var EN_US = new KeycodeLayout(
  "en-us",
  {
    8: "Backspace",
    9: "Tab",
    13: "Enter",
    16: "Shift",
    17: "Ctrl",
    18: "Alt",
    19: "Pause",
    27: "Escape",
    32: "Space",
    33: "PageUp",
    34: "PageDown",
    35: "End",
    36: "Home",
    37: "ArrowLeft",
    38: "ArrowUp",
    39: "ArrowRight",
    40: "ArrowDown",
    45: "Insert",
    46: "Delete",
    48: "0",
    49: "1",
    50: "2",
    51: "3",
    52: "4",
    53: "5",
    54: "6",
    55: "7",
    56: "8",
    57: "9",
    59: ";",
    61: "=",
    65: "A",
    66: "B",
    67: "C",
    68: "D",
    69: "E",
    70: "F",
    71: "G",
    72: "H",
    73: "I",
    74: "J",
    75: "K",
    76: "L",
    77: "M",
    78: "N",
    79: "O",
    80: "P",
    81: "Q",
    82: "R",
    83: "S",
    84: "T",
    85: "U",
    86: "V",
    87: "W",
    88: "X",
    89: "Y",
    90: "Z",
    91: "Meta",
    93: "ContextMenu",
    96: "0",
    97: "1",
    98: "2",
    99: "3",
    100: "4",
    101: "5",
    102: "6",
    103: "7",
    104: "8",
    105: "9",
    106: "*",
    107: "+",
    109: "-",
    110: ".",
    111: "/",
    112: "F1",
    113: "F2",
    114: "F3",
    115: "F4",
    116: "F5",
    117: "F6",
    118: "F7",
    119: "F8",
    120: "F9",
    121: "F10",
    122: "F11",
    123: "F12",
    173: "-",
    186: ";",
    187: "=",
    188: ",",
    189: "-",
    190: ".",
    191: "/",
    192: "`",
    219: "[",
    220: "\\",
    221: "]",
    222: "'",
    224: "Meta"
    // firefox
  },
  ["Shift", "Ctrl", "Alt", "Meta"]
  // modifier keys
);
var Private2;
(function(Private6) {
  Private6.keyboardLayout = EN_US;
})(Private2 || (Private2 = {}));

// node_modules/@lumino/commands/dist/index.es6.js
var import_signaling = require("@lumino/signaling");
var CommandRegistry = class _CommandRegistry {
  constructor() {
    this._timerID = 0;
    this._timerModifierID = 0;
    this._replaying = false;
    this._keystrokes = [];
    this._keydownEvents = [];
    this._keyBindings = [];
    this._exactKeyMatch = null;
    this._commands = /* @__PURE__ */ new Map();
    this._commandChanged = new import_signaling.Signal(this);
    this._commandExecuted = new import_signaling.Signal(this);
    this._keyBindingChanged = new import_signaling.Signal(this);
    this._holdKeyBindingPromises = /* @__PURE__ */ new Map();
  }
  /**
   * A signal emitted when a command has changed.
   *
   * #### Notes
   * This signal is useful for visual representations of commands which
   * need to refresh when the state of a relevant command has changed.
   */
  get commandChanged() {
    return this._commandChanged;
  }
  /**
   * A signal emitted when a command has executed.
   *
   * #### Notes
   * Care should be taken when consuming this signal. The command system is used
   * by many components for many user actions. Handlers registered with this
   * signal must return quickly to ensure the overall application remains responsive.
   */
  get commandExecuted() {
    return this._commandExecuted;
  }
  /**
   * A signal emitted when a key binding is changed.
   */
  get keyBindingChanged() {
    return this._keyBindingChanged;
  }
  /**
   * A read-only array of the key bindings in the registry.
   */
  get keyBindings() {
    return this._keyBindings;
  }
  /**
   * List the ids of the registered commands.
   *
   * @returns A new array of the registered command ids.
   */
  listCommands() {
    return Array.from(this._commands.keys());
  }
  /**
   * Test whether a specific command is registered.
   *
   * @param id - The id of the command of interest.
   *
   * @returns `true` if the command is registered, `false` otherwise.
   */
  hasCommand(id) {
    return this._commands.has(id);
  }
  /**
   * Add a command to the registry.
   *
   * @param id - The unique id of the command.
   *
   * @param options - The options for the command.
   *
   * @returns A disposable which will remove the command.
   *
   * @throws An error if the given `id` is already registered.
   */
  addCommand(id, options) {
    if (this._commands.has(id)) {
      throw new Error(`Command '${id}' already registered.`);
    }
    this._commands.set(id, Private3.createCommand(options));
    this._commandChanged.emit({ id, type: "added" });
    return new import_disposable2.DisposableDelegate(() => {
      this._commands.delete(id);
      this._commandChanged.emit({ id, type: "removed" });
    });
  }
  /**
   * Notify listeners that the state of a command has changed.
   *
   * @param id - The id of the command which has changed. If more than
   *   one command has changed, this argument should be omitted.
   *
   * @throws An error if the given `id` is not registered.
   *
   * #### Notes
   * This method should be called by the command author whenever the
   * application state changes such that the results of the command
   * metadata functions may have changed.
   *
   * This will cause the `commandChanged` signal to be emitted.
   */
  notifyCommandChanged(id) {
    if (id !== void 0 && !this._commands.has(id)) {
      throw new Error(`Command '${id}' is not registered.`);
    }
    this._commandChanged.emit({ id, type: id ? "changed" : "many-changed" });
  }
  /**
   * Get the description for a specific command.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns The description for the command.
   */
  describedBy(id, args = import_coreutils3.JSONExt.emptyObject) {
    var _a;
    let cmd = this._commands.get(id);
    return Promise.resolve((_a = cmd === null || cmd === void 0 ? void 0 : cmd.describedBy.call(void 0, args)) !== null && _a !== void 0 ? _a : { args: null });
  }
  /**
   * Get the display label for a specific command.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns The display label for the command, or an empty string
   *   if the command is not registered.
   */
  label(id, args = import_coreutils3.JSONExt.emptyObject) {
    var _a;
    let cmd = this._commands.get(id);
    return (_a = cmd === null || cmd === void 0 ? void 0 : cmd.label.call(void 0, args)) !== null && _a !== void 0 ? _a : "";
  }
  /**
   * Get the mnemonic index for a specific command.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns The mnemonic index for the command, or `-1` if the
   *   command is not registered.
   */
  mnemonic(id, args = import_coreutils3.JSONExt.emptyObject) {
    let cmd = this._commands.get(id);
    return cmd ? cmd.mnemonic.call(void 0, args) : -1;
  }
  /**
   * Get the icon renderer for a specific command.
   *
   * DEPRECATED: if set to a string value, the .icon field will
   * function as an alias for the .iconClass field, for backwards
   * compatibility. In the future when this is removed, the default
   * return type will become undefined.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns The icon renderer for the command or `undefined`.
   */
  icon(id, args = import_coreutils3.JSONExt.emptyObject) {
    var _a;
    return (_a = this._commands.get(id)) === null || _a === void 0 ? void 0 : _a.icon.call(void 0, args);
  }
  /**
   * Get the icon class for a specific command.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns The icon class for the command, or an empty string if
   *   the command is not registered.
   */
  iconClass(id, args = import_coreutils3.JSONExt.emptyObject) {
    let cmd = this._commands.get(id);
    return cmd ? cmd.iconClass.call(void 0, args) : "";
  }
  /**
   * Get the icon label for a specific command.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns The icon label for the command, or an empty string if
   *   the command is not registered.
   */
  iconLabel(id, args = import_coreutils3.JSONExt.emptyObject) {
    let cmd = this._commands.get(id);
    return cmd ? cmd.iconLabel.call(void 0, args) : "";
  }
  /**
   * Get the short form caption for a specific command.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns The caption for the command, or an empty string if the
   *   command is not registered.
   */
  caption(id, args = import_coreutils3.JSONExt.emptyObject) {
    let cmd = this._commands.get(id);
    return cmd ? cmd.caption.call(void 0, args) : "";
  }
  /**
   * Get the usage help text for a specific command.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns The usage text for the command, or an empty string if
   *   the command is not registered.
   */
  usage(id, args = import_coreutils3.JSONExt.emptyObject) {
    let cmd = this._commands.get(id);
    return cmd ? cmd.usage.call(void 0, args) : "";
  }
  /**
   * Get the extra class name for a specific command.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns The class name for the command, or an empty string if
   *   the command is not registered.
   */
  className(id, args = import_coreutils3.JSONExt.emptyObject) {
    let cmd = this._commands.get(id);
    return cmd ? cmd.className.call(void 0, args) : "";
  }
  /**
   * Get the dataset for a specific command.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns The dataset for the command, or an empty dataset if
   *   the command is not registered.
   */
  dataset(id, args = import_coreutils3.JSONExt.emptyObject) {
    let cmd = this._commands.get(id);
    return cmd ? cmd.dataset.call(void 0, args) : {};
  }
  /**
   * Test whether a specific command is enabled.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns A boolean indicating whether the command is enabled,
   *   or `false` if the command is not registered.
   */
  isEnabled(id, args = import_coreutils3.JSONExt.emptyObject) {
    let cmd = this._commands.get(id);
    return cmd ? cmd.isEnabled.call(void 0, args) : false;
  }
  /**
   * Test whether a specific command is toggled.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns A boolean indicating whether the command is toggled,
   *   or `false` if the command is not registered.
   */
  isToggled(id, args = import_coreutils3.JSONExt.emptyObject) {
    let cmd = this._commands.get(id);
    return cmd ? cmd.isToggled.call(void 0, args) : false;
  }
  /**
   * Test whether a specific command is toggleable.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns A boolean indicating whether the command is toggleable,
   *   or `false` if the command is not registered.
   */
  isToggleable(id, args = import_coreutils3.JSONExt.emptyObject) {
    let cmd = this._commands.get(id);
    return cmd ? cmd.isToggleable : false;
  }
  /**
   * Test whether a specific command is visible.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns A boolean indicating whether the command is visible,
   *   or `false` if the command is not registered.
   */
  isVisible(id, args = import_coreutils3.JSONExt.emptyObject) {
    let cmd = this._commands.get(id);
    return cmd ? cmd.isVisible.call(void 0, args) : false;
  }
  /**
   * Execute a specific command.
   *
   * @param id - The id of the command of interest.
   *
   * @param args - The arguments for the command.
   *
   * @returns A promise which resolves with the result of the command.
   *
   * #### Notes
   * The promise will reject if the command throws an exception,
   * or if the command is not registered.
   */
  execute(id, args = import_coreutils3.JSONExt.emptyObject) {
    let cmd = this._commands.get(id);
    if (!cmd) {
      return Promise.reject(new Error(`Command '${id}' not registered.`));
    }
    let value;
    try {
      value = cmd.execute.call(void 0, args);
    } catch (err) {
      value = Promise.reject(err);
    }
    let result = Promise.resolve(value);
    this._commandExecuted.emit({ id, args, result });
    return result;
  }
  /**
   * Add a key binding to the registry.
   *
   * @param options - The options for creating the key binding.
   *
   * @returns A disposable which removes the added key binding.
   *
   * #### Notes
   * If multiple key bindings are registered for the same sequence, the
   * binding with the highest selector specificity is executed first. A
   * tie is broken by using the most recently added key binding.
   *
   * Ambiguous key bindings are resolved with a timeout. As an example,
   * suppose two key bindings are registered: one with the key sequence
   * `['Ctrl D']`, and another with `['Ctrl D', 'Ctrl W']`. If the user
   * presses `Ctrl D`, the first binding cannot be immediately executed
   * since the user may intend to complete the chord with `Ctrl W`. For
   * such cases, a timer is used to allow the chord to be completed. If
   * the chord is not completed before the timeout, the first binding
   * is executed.
   */
  addKeyBinding(options) {
    let binding = Private3.createKeyBinding(options);
    this._keyBindings.push(binding);
    this._keyBindingChanged.emit({ binding, type: "added" });
    return new import_disposable2.DisposableDelegate(() => {
      import_algorithm.ArrayExt.removeFirstOf(this._keyBindings, binding);
      this._keyBindingChanged.emit({ binding, type: "removed" });
    });
  }
  /**
   * Process a `'keydown'` event and invoke a matching key binding.
   *
   * @param event - The event object for a `'keydown'` event.
   *
   * #### Notes
   * This should be called in response to a `'keydown'` event in order
   * to invoke the command for the best matching key binding.
   *
   * The registry **does not** install its own listener for `'keydown'`
   * events. This allows the application full control over the nodes
   * and phase for which the registry processes `'keydown'` events.
   *
   * When the keydown event is processed, if the event target or any of its
   * ancestor nodes has a `data-lm-suppress-shortcuts` attribute, its keydown
   * events will not invoke commands.
   */
  processKeydownEvent(event) {
    if (event.defaultPrevented || this._replaying) {
      return;
    }
    const keystroke = _CommandRegistry.keystrokeForKeydownEvent(event);
    if (!keystroke) {
      this._replayKeydownEvents();
      this._clearPendingState();
      return;
    }
    if (_CommandRegistry.isModifierKeyPressed(event)) {
      let { exact: exact2 } = Private3.matchKeyBinding(this._keyBindings, [keystroke], event);
      if (exact2) {
        event.preventDefault();
        event.stopPropagation();
        this._startModifierTimer(exact2);
      } else {
        this._clearModifierTimer();
      }
      return;
    }
    this._keystrokes.push(keystroke);
    const { exact, partial } = Private3.matchKeyBinding(this._keyBindings, this._keystrokes, event);
    const hasPartial = partial.length !== 0;
    if (!exact && !hasPartial) {
      this._replayKeydownEvents();
      this._clearPendingState();
      return;
    }
    if ((exact === null || exact === void 0 ? void 0 : exact.preventDefault) || partial.some((match) => match.preventDefault)) {
      event.preventDefault();
      event.stopPropagation();
    }
    this._keydownEvents.push(event);
    if (exact && !hasPartial) {
      this._executeKeyBinding(exact);
      this._clearPendingState();
      return;
    }
    if (exact) {
      this._exactKeyMatch = exact;
    }
    this._startTimer();
  }
  /**
   * Delay the execution of any command matched against the given 'keydown' event
   * until the `permission` to execute is granted.
   *
   * @param event - The event object for a `'keydown'` event.
   * @param permission - The promise with value indicating whether to proceed with the execution.
   *
   * ### Note
   * This enables the caller of `processKeydownEvent` to asynchronously prevent the
   * execution of the command based on external events.
   */
  holdKeyBindingExecution(event, permission) {
    this._holdKeyBindingPromises.set(event, permission);
  }
  /**
   * Process a ``keyup`` event to clear the timer on the modifier, if it exists.
   *
   * @param event - The event object for a `'keydown'` event.
   */
  processKeyupEvent(event) {
    this._clearModifierTimer();
  }
  /**
   * Start or restart the timeout on the modifier keys.
   *
   * This timeout will end only if the keys are hold.
   */
  _startModifierTimer(exact) {
    this._clearModifierTimer();
    this._timerModifierID = window.setTimeout(() => {
      this._executeKeyBinding(exact);
    }, Private3.modifierkeyTimeOut);
  }
  /**
   * Clear the timeout on modifier keys.
   */
  _clearModifierTimer() {
    if (this._timerModifierID !== 0) {
      clearTimeout(this._timerModifierID);
      this._timerModifierID = 0;
    }
  }
  /**
   * Start or restart the pending timeout.
   */
  _startTimer() {
    this._clearTimer();
    this._timerID = window.setTimeout(() => {
      this._onPendingTimeout();
    }, Private3.CHORD_TIMEOUT);
  }
  /**
   * Clear the pending timeout.
   */
  _clearTimer() {
    if (this._timerID !== 0) {
      clearTimeout(this._timerID);
      this._timerID = 0;
    }
  }
  /**
   * Replay the keydown events which were suppressed.
   */
  _replayKeydownEvents() {
    if (this._keydownEvents.length === 0) {
      return;
    }
    this._replaying = true;
    this._keydownEvents.forEach(Private3.replayKeyEvent);
    this._replaying = false;
  }
  /**
   * Execute the command for the given key binding.
   *
   * If the command is missing or disabled, a warning will be logged.
   *
   * The execution will not proceed if any of the events leading to
   * the keybinding matching were held with the permission resolving to false.
   */
  async _executeKeyBinding(binding) {
    if (this._holdKeyBindingPromises.size !== 0) {
      const keydownEvents = [...this._keydownEvents];
      const executionAllowed = (await Promise.race([
        Promise.all(keydownEvents.map(async (event) => {
          var _a;
          return (_a = this._holdKeyBindingPromises.get(event)) !== null && _a !== void 0 ? _a : Promise.resolve(true);
        })),
        new Promise((resolve) => {
          setTimeout(() => resolve([false]), Private3.KEYBINDING_HOLD_TIMEOUT);
        })
      ])).every(Boolean);
      this._holdKeyBindingPromises.clear();
      if (!executionAllowed) {
        return;
      }
    }
    let { command, args } = binding;
    let newArgs = {
      _luminoEvent: { type: "keybinding", keys: binding.keys },
      ...args
    };
    if (!this.hasCommand(command) || !this.isEnabled(command, newArgs)) {
      let word = this.hasCommand(command) ? "enabled" : "registered";
      let keys = binding.keys.join(", ");
      let msg1 = `Cannot execute key binding '${keys}':`;
      let msg2 = `command '${command}' is not ${word}.`;
      console.warn(`${msg1} ${msg2}`);
      return;
    }
    await this.execute(command, newArgs);
  }
  /**
   * Clear the internal pending state.
   */
  _clearPendingState() {
    this._clearTimer();
    this._clearModifierTimer();
    this._exactKeyMatch = null;
    this._keystrokes.length = 0;
    this._keydownEvents.length = 0;
  }
  /**
   * Handle the partial match timeout.
   */
  _onPendingTimeout() {
    this._timerID = 0;
    if (this._exactKeyMatch) {
      this._executeKeyBinding(this._exactKeyMatch);
    } else {
      this._replayKeydownEvents();
    }
    this._clearPendingState();
  }
};
(function(CommandRegistry2) {
  function parseKeystroke(keystroke) {
    let key = "";
    let alt = false;
    let cmd = false;
    let ctrl = false;
    let shift = false;
    for (let token of keystroke.split(/\s+/)) {
      if (token === "Accel") {
        if (import_domutils.Platform.IS_MAC) {
          cmd = true;
        } else {
          ctrl = true;
        }
      } else if (token === "Alt") {
        alt = true;
      } else if (token === "Cmd") {
        cmd = true;
      } else if (token === "Ctrl") {
        ctrl = true;
      } else if (token === "Shift") {
        shift = true;
      } else if (token.length > 0) {
        key = token;
      }
    }
    return { cmd, ctrl, alt, shift, key };
  }
  CommandRegistry2.parseKeystroke = parseKeystroke;
  function normalizeKeystroke(keystroke) {
    let mods = "";
    let parts = parseKeystroke(keystroke);
    if (parts.ctrl) {
      mods += "Ctrl ";
    }
    if (parts.alt) {
      mods += "Alt ";
    }
    if (parts.shift) {
      mods += "Shift ";
    }
    if (parts.cmd && import_domutils.Platform.IS_MAC) {
      mods += "Cmd ";
    }
    if (!parts.key) {
      return mods.trim();
    }
    return mods + parts.key;
  }
  CommandRegistry2.normalizeKeystroke = normalizeKeystroke;
  function normalizeKeys(options) {
    let keys;
    if (import_domutils.Platform.IS_WIN) {
      keys = options.winKeys || options.keys;
    } else if (import_domutils.Platform.IS_MAC) {
      keys = options.macKeys || options.keys;
    } else {
      keys = options.linuxKeys || options.keys;
    }
    return keys.map(normalizeKeystroke);
  }
  CommandRegistry2.normalizeKeys = normalizeKeys;
  function formatKeystroke(keystroke) {
    return typeof keystroke === "string" ? formatSingleKey(keystroke) : keystroke.map(formatSingleKey).join(", ");
    function formatSingleKey(key) {
      let mods = [];
      let separator = import_domutils.Platform.IS_MAC ? " " : "+";
      let parts = parseKeystroke(key);
      if (parts.ctrl) {
        mods.push("Ctrl");
      }
      if (parts.alt) {
        mods.push("Alt");
      }
      if (parts.shift) {
        mods.push("Shift");
      }
      if (import_domutils.Platform.IS_MAC && parts.cmd) {
        mods.push("Cmd");
      }
      mods.push(parts.key);
      return mods.map(Private3.formatKey).join(separator);
    }
  }
  CommandRegistry2.formatKeystroke = formatKeystroke;
  function isModifierKeyPressed(event) {
    let layout = getKeyboardLayout();
    let key = layout.keyForKeydownEvent(event);
    return layout.isModifierKey(key);
  }
  CommandRegistry2.isModifierKeyPressed = isModifierKeyPressed;
  function keystrokeForKeydownEvent(event) {
    let layout = getKeyboardLayout();
    let key = layout.keyForKeydownEvent(event);
    let mods = [];
    if (event.ctrlKey) {
      mods.push("Ctrl");
    }
    if (event.altKey) {
      mods.push("Alt");
    }
    if (event.shiftKey) {
      mods.push("Shift");
    }
    if (event.metaKey && import_domutils.Platform.IS_MAC) {
      mods.push("Cmd");
    }
    if (!layout.isModifierKey(key)) {
      mods.push(key);
    }
    return mods.join(" ");
  }
  CommandRegistry2.keystrokeForKeydownEvent = keystrokeForKeydownEvent;
})(CommandRegistry || (CommandRegistry = {}));
var Private3;
(function(Private6) {
  Private6.CHORD_TIMEOUT = 1e3;
  Private6.KEYBINDING_HOLD_TIMEOUT = 1e3;
  Private6.modifierkeyTimeOut = 500;
  function createCommand(options) {
    return {
      execute: options.execute,
      describedBy: asFunc(typeof options.describedBy === "function" ? options.describedBy : { args: null, ...options.describedBy }, () => {
        return { args: null };
      }),
      label: asFunc(options.label, emptyStringFunc),
      mnemonic: asFunc(options.mnemonic, negativeOneFunc),
      icon: asFunc(options.icon, undefinedFunc),
      iconClass: asFunc(options.iconClass, emptyStringFunc),
      iconLabel: asFunc(options.iconLabel, emptyStringFunc),
      caption: asFunc(options.caption, emptyStringFunc),
      usage: asFunc(options.usage, emptyStringFunc),
      className: asFunc(options.className, emptyStringFunc),
      dataset: asFunc(options.dataset, emptyDatasetFunc),
      isEnabled: options.isEnabled || trueFunc,
      isToggled: options.isToggled || falseFunc,
      isToggleable: options.isToggleable || !!options.isToggled,
      isVisible: options.isVisible || trueFunc
    };
  }
  Private6.createCommand = createCommand;
  function createKeyBinding(options) {
    var _a;
    return {
      keys: CommandRegistry.normalizeKeys(options),
      selector: validateSelector(options),
      command: options.command,
      args: options.args || import_coreutils3.JSONExt.emptyObject,
      preventDefault: (_a = options.preventDefault) !== null && _a !== void 0 ? _a : true
    };
  }
  Private6.createKeyBinding = createKeyBinding;
  function matchKeyBinding(bindings, keys, event) {
    let exact = null;
    let partial = [];
    let distance = Infinity;
    let specificity = 0;
    for (let i = 0, n = bindings.length; i < n; ++i) {
      let binding = bindings[i];
      let sqm = matchSequence(binding.keys, keys);
      if (sqm === 0) {
        continue;
      }
      if (sqm === 2) {
        if (targetDistance(binding.selector, event) !== -1) {
          partial.push(binding);
        }
        continue;
      }
      let td = targetDistance(binding.selector, event);
      if (td === -1 || td > distance) {
        continue;
      }
      let sp = import_domutils.Selector.calculateSpecificity(binding.selector);
      if (!exact || td < distance || sp >= specificity) {
        exact = binding;
        distance = td;
        specificity = sp;
      }
    }
    return { exact, partial };
  }
  Private6.matchKeyBinding = matchKeyBinding;
  function replayKeyEvent(event) {
    event.target.dispatchEvent(cloneKeyboardEvent(event));
  }
  Private6.replayKeyEvent = replayKeyEvent;
  function formatKey(key) {
    if (import_domutils.Platform.IS_MAC) {
      return MAC_DISPLAY.hasOwnProperty(key) ? MAC_DISPLAY[key] : key;
    } else {
      return WIN_DISPLAY.hasOwnProperty(key) ? WIN_DISPLAY[key] : key;
    }
  }
  Private6.formatKey = formatKey;
  const MAC_DISPLAY = {
    Backspace: "\u232B",
    Tab: "\u21E5",
    Enter: "\u23CE",
    Shift: "\u21E7",
    Ctrl: "\u2303",
    Alt: "\u2325",
    Escape: "\u238B",
    PageUp: "\u21DE",
    PageDown: "\u21DF",
    End: "\u2198",
    Home: "\u2196",
    ArrowLeft: "\u2190",
    ArrowUp: "\u2191",
    ArrowRight: "\u2192",
    ArrowDown: "\u2193",
    Delete: "\u2326",
    Cmd: "\u2318"
  };
  const WIN_DISPLAY = {
    Escape: "Esc",
    PageUp: "Page Up",
    PageDown: "Page Down",
    ArrowLeft: "Left",
    ArrowUp: "Up",
    ArrowRight: "Right",
    ArrowDown: "Down",
    Delete: "Del"
  };
  const emptyStringFunc = () => "";
  const negativeOneFunc = () => -1;
  const trueFunc = () => true;
  const falseFunc = () => false;
  const emptyDatasetFunc = () => ({});
  const undefinedFunc = () => void 0;
  function asFunc(value, dfault) {
    if (value === void 0) {
      return dfault;
    }
    if (typeof value === "function") {
      return value;
    }
    return () => value;
  }
  function validateSelector(options) {
    if (options.selector.indexOf(",") !== -1) {
      throw new Error(`Selector cannot contain commas: ${options.selector}`);
    }
    if (!import_domutils.Selector.isValid(options.selector)) {
      throw new Error(`Invalid selector: ${options.selector}`);
    }
    return options.selector;
  }
  function matchSequence(bindKeys, userKeys) {
    if (bindKeys.length < userKeys.length) {
      return 0;
    }
    for (let i = 0, n = userKeys.length; i < n; ++i) {
      if (bindKeys[i] !== userKeys[i]) {
        return 0;
      }
    }
    if (bindKeys.length > userKeys.length) {
      return 2;
    }
    return 1;
  }
  function targetDistance(selector, event) {
    let targ = event.target;
    let curr = event.currentTarget;
    for (let dist = 0; targ !== null; targ = targ.parentElement, ++dist) {
      if (targ.hasAttribute("data-lm-suppress-shortcuts")) {
        return -1;
      }
      if (import_domutils.Selector.matches(targ, selector)) {
        return dist;
      }
      if (targ === curr) {
        return -1;
      }
    }
    return -1;
  }
  function cloneKeyboardEvent(event) {
    let clone = document.createEvent("Event");
    let bubbles = event.bubbles || true;
    let cancelable = event.cancelable || true;
    clone.initEvent(event.type || "keydown", bubbles, cancelable);
    clone.key = event.key || "";
    clone.keyCode = event.keyCode || 0;
    clone.which = event.keyCode || 0;
    clone.ctrlKey = event.ctrlKey || false;
    clone.altKey = event.altKey || false;
    clone.shiftKey = event.shiftKey || false;
    clone.metaKey = event.metaKey || false;
    clone.view = event.view || window;
    return clone;
  }
})(Private3 || (Private3 = {}));

// node_modules/@lumino/widgets/dist/index.es6.js
var import_virtualdom = require("@lumino/virtualdom");
var import_disposable3 = require("@lumino/disposable");
var BoxSizer = class {
  constructor() {
    this.sizeHint = 0;
    this.minSize = 0;
    this.maxSize = Infinity;
    this.stretch = 1;
    this.size = 0;
    this.done = false;
  }
};
var BoxEngine;
(function(BoxEngine2) {
  function calc(sizers, space) {
    let count = sizers.length;
    if (count === 0) {
      return space;
    }
    let totalMin = 0;
    let totalMax = 0;
    let totalSize = 0;
    let totalStretch = 0;
    let stretchCount = 0;
    for (let i = 0; i < count; ++i) {
      let sizer = sizers[i];
      let min = sizer.minSize;
      let max2 = sizer.maxSize;
      let hint = sizer.sizeHint;
      sizer.done = false;
      sizer.size = Math.max(min, Math.min(hint, max2));
      totalSize += sizer.size;
      totalMin += min;
      totalMax += max2;
      if (sizer.stretch > 0) {
        totalStretch += sizer.stretch;
        stretchCount++;
      }
    }
    if (space === totalSize) {
      return 0;
    }
    if (space <= totalMin) {
      for (let i = 0; i < count; ++i) {
        let sizer = sizers[i];
        sizer.size = sizer.minSize;
      }
      return space - totalMin;
    }
    if (space >= totalMax) {
      for (let i = 0; i < count; ++i) {
        let sizer = sizers[i];
        sizer.size = sizer.maxSize;
      }
      return space - totalMax;
    }
    let nearZero = 0.01;
    let notDoneCount = count;
    if (space < totalSize) {
      let freeSpace = totalSize - space;
      while (stretchCount > 0 && freeSpace > nearZero) {
        let distSpace = freeSpace;
        let distStretch = totalStretch;
        for (let i = 0; i < count; ++i) {
          let sizer = sizers[i];
          if (sizer.done || sizer.stretch === 0) {
            continue;
          }
          let amt = sizer.stretch * distSpace / distStretch;
          if (sizer.size - amt <= sizer.minSize) {
            freeSpace -= sizer.size - sizer.minSize;
            totalStretch -= sizer.stretch;
            sizer.size = sizer.minSize;
            sizer.done = true;
            notDoneCount--;
            stretchCount--;
          } else {
            freeSpace -= amt;
            sizer.size -= amt;
          }
        }
      }
      while (notDoneCount > 0 && freeSpace > nearZero) {
        let amt = freeSpace / notDoneCount;
        for (let i = 0; i < count; ++i) {
          let sizer = sizers[i];
          if (sizer.done) {
            continue;
          }
          if (sizer.size - amt <= sizer.minSize) {
            freeSpace -= sizer.size - sizer.minSize;
            sizer.size = sizer.minSize;
            sizer.done = true;
            notDoneCount--;
          } else {
            freeSpace -= amt;
            sizer.size -= amt;
          }
        }
      }
    } else {
      let freeSpace = space - totalSize;
      while (stretchCount > 0 && freeSpace > nearZero) {
        let distSpace = freeSpace;
        let distStretch = totalStretch;
        for (let i = 0; i < count; ++i) {
          let sizer = sizers[i];
          if (sizer.done || sizer.stretch === 0) {
            continue;
          }
          let amt = sizer.stretch * distSpace / distStretch;
          if (sizer.size + amt >= sizer.maxSize) {
            freeSpace -= sizer.maxSize - sizer.size;
            totalStretch -= sizer.stretch;
            sizer.size = sizer.maxSize;
            sizer.done = true;
            notDoneCount--;
            stretchCount--;
          } else {
            freeSpace -= amt;
            sizer.size += amt;
          }
        }
      }
      while (notDoneCount > 0 && freeSpace > nearZero) {
        let amt = freeSpace / notDoneCount;
        for (let i = 0; i < count; ++i) {
          let sizer = sizers[i];
          if (sizer.done) {
            continue;
          }
          if (sizer.size + amt >= sizer.maxSize) {
            freeSpace -= sizer.maxSize - sizer.size;
            sizer.size = sizer.maxSize;
            sizer.done = true;
            notDoneCount--;
          } else {
            freeSpace -= amt;
            sizer.size += amt;
          }
        }
      }
    }
    return 0;
  }
  BoxEngine2.calc = calc;
  function adjust(sizers, index, delta) {
    if (sizers.length === 0 || delta === 0) {
      return;
    }
    if (delta > 0) {
      growSizer(sizers, index, delta);
    } else {
      shrinkSizer(sizers, index, -delta);
    }
  }
  BoxEngine2.adjust = adjust;
  function growSizer(sizers, index, delta) {
    let growLimit = 0;
    for (let i = 0; i <= index; ++i) {
      let sizer = sizers[i];
      growLimit += sizer.maxSize - sizer.size;
    }
    let shrinkLimit = 0;
    for (let i = index + 1, n = sizers.length; i < n; ++i) {
      let sizer = sizers[i];
      shrinkLimit += sizer.size - sizer.minSize;
    }
    delta = Math.min(delta, growLimit, shrinkLimit);
    let grow = delta;
    for (let i = index; i >= 0 && grow > 0; --i) {
      let sizer = sizers[i];
      let limit = sizer.maxSize - sizer.size;
      if (limit >= grow) {
        sizer.sizeHint = sizer.size + grow;
        grow = 0;
      } else {
        sizer.sizeHint = sizer.size + limit;
        grow -= limit;
      }
    }
    let shrink = delta;
    for (let i = index + 1, n = sizers.length; i < n && shrink > 0; ++i) {
      let sizer = sizers[i];
      let limit = sizer.size - sizer.minSize;
      if (limit >= shrink) {
        sizer.sizeHint = sizer.size - shrink;
        shrink = 0;
      } else {
        sizer.sizeHint = sizer.size - limit;
        shrink -= limit;
      }
    }
  }
  function shrinkSizer(sizers, index, delta) {
    let growLimit = 0;
    for (let i = index + 1, n = sizers.length; i < n; ++i) {
      let sizer = sizers[i];
      growLimit += sizer.maxSize - sizer.size;
    }
    let shrinkLimit = 0;
    for (let i = 0; i <= index; ++i) {
      let sizer = sizers[i];
      shrinkLimit += sizer.size - sizer.minSize;
    }
    delta = Math.min(delta, growLimit, shrinkLimit);
    let grow = delta;
    for (let i = index + 1, n = sizers.length; i < n && grow > 0; ++i) {
      let sizer = sizers[i];
      let limit = sizer.maxSize - sizer.size;
      if (limit >= grow) {
        sizer.sizeHint = sizer.size + grow;
        grow = 0;
      } else {
        sizer.sizeHint = sizer.size + limit;
        grow -= limit;
      }
    }
    let shrink = delta;
    for (let i = index; i >= 0 && shrink > 0; --i) {
      let sizer = sizers[i];
      let limit = sizer.size - sizer.minSize;
      if (limit >= shrink) {
        sizer.sizeHint = sizer.size - shrink;
        shrink = 0;
      } else {
        sizer.sizeHint = sizer.size - limit;
        shrink -= limit;
      }
    }
  }
})(BoxEngine || (BoxEngine = {}));
var Title = class {
  /**
   * Construct a new title.
   *
   * @param options - The options for initializing the title.
   */
  constructor(options) {
    this._label = "";
    this._caption = "";
    this._mnemonic = -1;
    this._icon = void 0;
    this._iconClass = "";
    this._iconLabel = "";
    this._className = "";
    this._closable = false;
    this._changed = new import_signaling2.Signal(this);
    this._isDisposed = false;
    this.owner = options.owner;
    if (options.label !== void 0) {
      this._label = options.label;
    }
    if (options.mnemonic !== void 0) {
      this._mnemonic = options.mnemonic;
    }
    if (options.icon !== void 0) {
      this._icon = options.icon;
    }
    if (options.iconClass !== void 0) {
      this._iconClass = options.iconClass;
    }
    if (options.iconLabel !== void 0) {
      this._iconLabel = options.iconLabel;
    }
    if (options.caption !== void 0) {
      this._caption = options.caption;
    }
    if (options.className !== void 0) {
      this._className = options.className;
    }
    if (options.closable !== void 0) {
      this._closable = options.closable;
    }
    this._dataset = options.dataset || {};
  }
  /**
   * A signal emitted when the state of the title changes.
   */
  get changed() {
    return this._changed;
  }
  /**
   * Get the label for the title.
   *
   * #### Notes
   * The default value is an empty string.
   */
  get label() {
    return this._label;
  }
  /**
   * Set the label for the title.
   */
  set label(value) {
    if (this._label === value) {
      return;
    }
    this._label = value;
    this._changed.emit(void 0);
  }
  /**
   * Get the mnemonic index for the title.
   *
   * #### Notes
   * The default value is `-1`.
   */
  get mnemonic() {
    return this._mnemonic;
  }
  /**
   * Set the mnemonic index for the title.
   */
  set mnemonic(value) {
    if (this._mnemonic === value) {
      return;
    }
    this._mnemonic = value;
    this._changed.emit(void 0);
  }
  /**
   * Get the icon renderer for the title.
   *
   * #### Notes
   * The default value is undefined.
   */
  get icon() {
    return this._icon;
  }
  /**
   * Set the icon renderer for the title.
   *
   * #### Notes
   * A renderer is an object that supplies a render and unrender function.
   */
  set icon(value) {
    if (this._icon === value) {
      return;
    }
    this._icon = value;
    this._changed.emit(void 0);
  }
  /**
   * Get the icon class name for the title.
   *
   * #### Notes
   * The default value is an empty string.
   */
  get iconClass() {
    return this._iconClass;
  }
  /**
   * Set the icon class name for the title.
   *
   * #### Notes
   * Multiple class names can be separated with whitespace.
   */
  set iconClass(value) {
    if (this._iconClass === value) {
      return;
    }
    this._iconClass = value;
    this._changed.emit(void 0);
  }
  /**
   * Get the icon label for the title.
   *
   * #### Notes
   * The default value is an empty string.
   */
  get iconLabel() {
    return this._iconLabel;
  }
  /**
   * Set the icon label for the title.
   *
   * #### Notes
   * Multiple class names can be separated with whitespace.
   */
  set iconLabel(value) {
    if (this._iconLabel === value) {
      return;
    }
    this._iconLabel = value;
    this._changed.emit(void 0);
  }
  /**
   * Get the caption for the title.
   *
   * #### Notes
   * The default value is an empty string.
   */
  get caption() {
    return this._caption;
  }
  /**
   * Set the caption for the title.
   */
  set caption(value) {
    if (this._caption === value) {
      return;
    }
    this._caption = value;
    this._changed.emit(void 0);
  }
  /**
   * Get the extra class name for the title.
   *
   * #### Notes
   * The default value is an empty string.
   */
  get className() {
    return this._className;
  }
  /**
   * Set the extra class name for the title.
   *
   * #### Notes
   * Multiple class names can be separated with whitespace.
   */
  set className(value) {
    if (this._className === value) {
      return;
    }
    this._className = value;
    this._changed.emit(void 0);
  }
  /**
   * Get the closable state for the title.
   *
   * #### Notes
   * The default value is `false`.
   */
  get closable() {
    return this._closable;
  }
  /**
   * Set the closable state for the title.
   *
   * #### Notes
   * This controls the presence of a close icon when applicable.
   */
  set closable(value) {
    if (this._closable === value) {
      return;
    }
    this._closable = value;
    this._changed.emit(void 0);
  }
  /**
   * Get the dataset for the title.
   *
   * #### Notes
   * The default value is an empty dataset.
   */
  get dataset() {
    return this._dataset;
  }
  /**
   * Set the dataset for the title.
   *
   * #### Notes
   * This controls the data attributes when applicable.
   */
  set dataset(value) {
    if (this._dataset === value) {
      return;
    }
    this._dataset = value;
    this._changed.emit(void 0);
  }
  /**
   * Test whether the title has been disposed.
   */
  get isDisposed() {
    return this._isDisposed;
  }
  /**
   * Dispose of the resources held by the title.
   *
   * #### Notes
   * It is the responsibility of the owner to call the title disposal.
   */
  dispose() {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    import_signaling2.Signal.clearData(this);
  }
};
var Widget = class _Widget {
  /**
   * Construct a new widget.
   *
   * @param options - The options for initializing the widget.
   */
  constructor(options = {}) {
    this._flags = 0;
    this._layout = null;
    this._parent = null;
    this._disposed = new import_signaling2.Signal(this);
    this._hiddenMode = _Widget.HiddenMode.Display;
    this.node = Private$j.createNode(options);
    this.addClass("lm-Widget");
  }
  /**
   * Dispose of the widget and its descendant widgets.
   *
   * #### Notes
   * It is unsafe to use the widget after it has been disposed.
   *
   * All calls made to this method after the first are a no-op.
   */
  dispose() {
    if (this.isDisposed) {
      return;
    }
    this.setFlag(_Widget.Flag.IsDisposed);
    this._disposed.emit(void 0);
    if (this.parent) {
      this.parent = null;
    } else if (this.isAttached) {
      _Widget.detach(this);
    }
    if (this._layout) {
      this._layout.dispose();
      this._layout = null;
    }
    this.title.dispose();
    import_signaling2.Signal.clearData(this);
    import_messaging.MessageLoop.clearData(this);
    import_properties.AttachedProperty.clearData(this);
  }
  /**
   * A signal emitted when the widget is disposed.
   */
  get disposed() {
    return this._disposed;
  }
  /**
   * Test whether the widget has been disposed.
   */
  get isDisposed() {
    return this.testFlag(_Widget.Flag.IsDisposed);
  }
  /**
   * Test whether the widget's node is attached to the DOM.
   */
  get isAttached() {
    return this.testFlag(_Widget.Flag.IsAttached);
  }
  /**
   * Test whether the widget is explicitly hidden.
   *
   * #### Notes
   * You should prefer `!{@link isVisible}` over `{@link isHidden}` if you want to know if the
   * widget is hidden as this does not test if the widget is hidden because one of its ancestors is hidden.
   */
  get isHidden() {
    return this.testFlag(_Widget.Flag.IsHidden);
  }
  /**
   * Test whether the widget is visible.
   *
   * #### Notes
   * A widget is visible when it is attached to the DOM, is not
   * explicitly hidden, and has no explicitly hidden ancestors.
   *
   * Since 2.7.0, this does not rely on the {@link Widget.Flag.IsVisible} flag.
   * It recursively checks the visibility of all parent widgets.
   */
  get isVisible() {
    let parent = this;
    do {
      if (parent.isHidden || !parent.isAttached) {
        return false;
      }
      parent = parent.parent;
    } while (parent != null);
    return true;
  }
  /**
   * The title object for the widget.
   *
   * #### Notes
   * The title object is used by some container widgets when displaying
   * the widget alongside some title, such as a tab panel or side bar.
   *
   * Since not all widgets will use the title, it is created on demand.
   *
   * The `owner` property of the title is set to this widget.
   */
  get title() {
    return Private$j.titleProperty.get(this);
  }
  /**
   * Get the id of the widget's DOM node.
   */
  get id() {
    return this.node.id;
  }
  /**
   * Set the id of the widget's DOM node.
   */
  set id(value) {
    this.node.id = value;
  }
  /**
   * The dataset for the widget's DOM node.
   */
  get dataset() {
    return this.node.dataset;
  }
  /**
   * Get the method for hiding the widget.
   */
  get hiddenMode() {
    return this._hiddenMode;
  }
  /**
   * Set the method for hiding the widget.
   */
  set hiddenMode(value) {
    if (this._hiddenMode === value) {
      return;
    }
    if (this.isHidden) {
      this._toggleHidden(false);
    }
    if (value == _Widget.HiddenMode.Scale) {
      this.node.style.willChange = "transform";
    } else {
      this.node.style.willChange = "auto";
    }
    this._hiddenMode = value;
    if (this.isHidden) {
      this._toggleHidden(true);
    }
  }
  /**
   * Get the parent of the widget.
   */
  get parent() {
    return this._parent;
  }
  /**
   * Set the parent of the widget.
   *
   * #### Notes
   * Children are typically added to a widget by using a layout, which
   * means user code will not normally set the parent widget directly.
   *
   * The widget will be automatically removed from its old parent.
   *
   * This is a no-op if there is no effective parent change.
   */
  set parent(value) {
    if (this._parent === value) {
      return;
    }
    if (value && this.contains(value)) {
      throw new Error("Invalid parent widget.");
    }
    if (this._parent && !this._parent.isDisposed) {
      let msg = new _Widget.ChildMessage("child-removed", this);
      import_messaging.MessageLoop.sendMessage(this._parent, msg);
    }
    this._parent = value;
    if (this._parent && !this._parent.isDisposed) {
      let msg = new _Widget.ChildMessage("child-added", this);
      import_messaging.MessageLoop.sendMessage(this._parent, msg);
    }
    if (!this.isDisposed) {
      import_messaging.MessageLoop.sendMessage(this, _Widget.Msg.ParentChanged);
    }
  }
  /**
   * Get the layout for the widget.
   */
  get layout() {
    return this._layout;
  }
  /**
   * Set the layout for the widget.
   *
   * #### Notes
   * The layout is single-use only. It cannot be changed after the
   * first assignment.
   *
   * The layout is disposed automatically when the widget is disposed.
   */
  set layout(value) {
    if (this._layout === value) {
      return;
    }
    if (this.testFlag(_Widget.Flag.DisallowLayout)) {
      throw new Error("Cannot set widget layout.");
    }
    if (this._layout) {
      throw new Error("Cannot change widget layout.");
    }
    if (value.parent) {
      throw new Error("Cannot change layout parent.");
    }
    this._layout = value;
    value.parent = this;
  }
  /**
   * Create an iterator over the widget's children.
   *
   * @returns A new iterator over the children of the widget.
   *
   * #### Notes
   * The widget must have a populated layout in order to have children.
   *
   * If a layout is not installed, the returned iterator will be empty.
   */
  *children() {
    if (this._layout) {
      yield* this._layout;
    }
  }
  /**
   * Test whether a widget is a descendant of this widget.
   *
   * @param widget - The descendant widget of interest.
   *
   * @returns `true` if the widget is a descendant, `false` otherwise.
   */
  contains(widget) {
    for (let value = widget; value; value = value._parent) {
      if (value === this) {
        return true;
      }
    }
    return false;
  }
  /**
   * Test whether the widget's DOM node has the given class name.
   *
   * @param name - The class name of interest.
   *
   * @returns `true` if the node has the class, `false` otherwise.
   */
  hasClass(name) {
    return this.node.classList.contains(name);
  }
  /**
   * Add a class name to the widget's DOM node.
   *
   * @param name - The class name to add to the node.
   *
   * #### Notes
   * If the class name is already added to the node, this is a no-op.
   *
   * The class name must not contain whitespace.
   */
  addClass(name) {
    this.node.classList.add(name);
  }
  /**
   * Remove a class name from the widget's DOM node.
   *
   * @param name - The class name to remove from the node.
   *
   * #### Notes
   * If the class name is not yet added to the node, this is a no-op.
   *
   * The class name must not contain whitespace.
   */
  removeClass(name) {
    this.node.classList.remove(name);
  }
  /**
   * Toggle a class name on the widget's DOM node.
   *
   * @param name - The class name to toggle on the node.
   *
   * @param force - Whether to force add the class (`true`) or force
   *   remove the class (`false`). If not provided, the presence of
   *   the class will be toggled from its current state.
   *
   * @returns `true` if the class is now present, `false` otherwise.
   *
   * #### Notes
   * The class name must not contain whitespace.
   */
  toggleClass(name, force) {
    if (force === true) {
      this.node.classList.add(name);
      return true;
    }
    if (force === false) {
      this.node.classList.remove(name);
      return false;
    }
    return this.node.classList.toggle(name);
  }
  /**
   * Post an `'update-request'` message to the widget.
   *
   * #### Notes
   * This is a simple convenience method for posting the message.
   */
  update() {
    import_messaging.MessageLoop.postMessage(this, _Widget.Msg.UpdateRequest);
  }
  /**
   * Post a `'fit-request'` message to the widget.
   *
   * #### Notes
   * This is a simple convenience method for posting the message.
   */
  fit() {
    import_messaging.MessageLoop.postMessage(this, _Widget.Msg.FitRequest);
  }
  /**
   * Post an `'activate-request'` message to the widget.
   *
   * #### Notes
   * This is a simple convenience method for posting the message.
   */
  activate() {
    import_messaging.MessageLoop.postMessage(this, _Widget.Msg.ActivateRequest);
  }
  /**
   * Send a `'close-request'` message to the widget.
   *
   * #### Notes
   * This is a simple convenience method for sending the message.
   */
  close() {
    import_messaging.MessageLoop.sendMessage(this, _Widget.Msg.CloseRequest);
  }
  /**
   * Show the widget and make it visible to its parent widget.
   *
   * #### Notes
   * This causes the {@link isHidden} property to be `false`.
   *
   * If the widget is not explicitly hidden, this is a no-op.
   */
  show() {
    if (!this.testFlag(_Widget.Flag.IsHidden)) {
      return;
    }
    if (this.isAttached && (!this.parent || this.parent.isVisible)) {
      import_messaging.MessageLoop.sendMessage(this, _Widget.Msg.BeforeShow);
    }
    this.clearFlag(_Widget.Flag.IsHidden);
    this._toggleHidden(false);
    if (this.isAttached && (!this.parent || this.parent.isVisible)) {
      import_messaging.MessageLoop.sendMessage(this, _Widget.Msg.AfterShow);
    }
    if (this.parent) {
      let msg = new _Widget.ChildMessage("child-shown", this);
      import_messaging.MessageLoop.sendMessage(this.parent, msg);
    }
  }
  /**
   * Hide the widget and make it hidden to its parent widget.
   *
   * #### Notes
   * This causes the {@link isHidden} property to be `true`.
   *
   * If the widget is explicitly hidden, this is a no-op.
   */
  hide() {
    if (this.testFlag(_Widget.Flag.IsHidden)) {
      return;
    }
    if (this.isAttached && (!this.parent || this.parent.isVisible)) {
      import_messaging.MessageLoop.sendMessage(this, _Widget.Msg.BeforeHide);
    }
    this.setFlag(_Widget.Flag.IsHidden);
    this._toggleHidden(true);
    if (this.isAttached && (!this.parent || this.parent.isVisible)) {
      import_messaging.MessageLoop.sendMessage(this, _Widget.Msg.AfterHide);
    }
    if (this.parent) {
      let msg = new _Widget.ChildMessage("child-hidden", this);
      import_messaging.MessageLoop.sendMessage(this.parent, msg);
    }
  }
  /**
   * Show or hide the widget according to a boolean value.
   *
   * @param hidden - `true` to hide the widget, or `false` to show it.
   *
   * #### Notes
   * This is a convenience method for `hide()` and `show()`.
   */
  setHidden(hidden) {
    if (hidden) {
      this.hide();
    } else {
      this.show();
    }
  }
  /**
   * Test whether the given widget flag is set.
   *
   * #### Notes
   * This will not typically be called directly by user code.
   *
   * Since 2.7.0, {@link Widget.Flag.IsVisible} is deprecated.
   * It will be removed in a future version.
   */
  testFlag(flag) {
    return (this._flags & flag) !== 0;
  }
  /**
   * Set the given widget flag.
   *
   * #### Notes
   * This will not typically be called directly by user code.
   *
   * Since 2.7.0, {@link Widget.Flag.IsVisible} is deprecated.
   * It will be removed in a future version.
   */
  setFlag(flag) {
    this._flags |= flag;
  }
  /**
   * Clear the given widget flag.
   *
   * #### Notes
   * This will not typically be called directly by user code.
   *
   * Since 2.7.0, {@link Widget.Flag.IsVisible} is deprecated.
   * It will be removed in a future version.
   */
  clearFlag(flag) {
    this._flags &= ~flag;
  }
  /**
   * Process a message sent to the widget.
   *
   * @param msg - The message sent to the widget.
   *
   * #### Notes
   * Subclasses may reimplement this method as needed.
   */
  processMessage(msg) {
    switch (msg.type) {
      case "resize":
        this.notifyLayout(msg);
        this.onResize(msg);
        break;
      case "update-request":
        this.notifyLayout(msg);
        this.onUpdateRequest(msg);
        break;
      case "fit-request":
        this.notifyLayout(msg);
        this.onFitRequest(msg);
        break;
      case "before-show":
        this.notifyLayout(msg);
        this.onBeforeShow(msg);
        break;
      case "after-show":
        this.setFlag(_Widget.Flag.IsVisible);
        this.notifyLayout(msg);
        this.onAfterShow(msg);
        break;
      case "before-hide":
        this.notifyLayout(msg);
        this.onBeforeHide(msg);
        break;
      case "after-hide":
        this.clearFlag(_Widget.Flag.IsVisible);
        this.notifyLayout(msg);
        this.onAfterHide(msg);
        break;
      case "before-attach":
        this.notifyLayout(msg);
        this.onBeforeAttach(msg);
        break;
      case "after-attach":
        if (!this.isHidden && (!this.parent || this.parent.isVisible)) {
          this.setFlag(_Widget.Flag.IsVisible);
        }
        this.setFlag(_Widget.Flag.IsAttached);
        this.notifyLayout(msg);
        this.onAfterAttach(msg);
        break;
      case "before-detach":
        this.notifyLayout(msg);
        this.onBeforeDetach(msg);
        break;
      case "after-detach":
        this.clearFlag(_Widget.Flag.IsVisible);
        this.clearFlag(_Widget.Flag.IsAttached);
        this.notifyLayout(msg);
        this.onAfterDetach(msg);
        break;
      case "activate-request":
        this.notifyLayout(msg);
        this.onActivateRequest(msg);
        break;
      case "close-request":
        this.notifyLayout(msg);
        this.onCloseRequest(msg);
        break;
      case "child-added":
        this.notifyLayout(msg);
        this.onChildAdded(msg);
        break;
      case "child-removed":
        this.notifyLayout(msg);
        this.onChildRemoved(msg);
        break;
      default:
        this.notifyLayout(msg);
        break;
    }
  }
  /**
   * Invoke the message processing routine of the widget's layout.
   *
   * @param msg - The message to dispatch to the layout.
   *
   * #### Notes
   * This is a no-op if the widget does not have a layout.
   *
   * This will not typically be called directly by user code.
   */
  notifyLayout(msg) {
    if (this._layout) {
      this._layout.processParentMessage(msg);
    }
  }
  /**
   * A message handler invoked on a `'close-request'` message.
   *
   * #### Notes
   * The default implementation unparents or detaches the widget.
   */
  onCloseRequest(msg) {
    if (this.parent) {
      this.parent = null;
    } else if (this.isAttached) {
      _Widget.detach(this);
    }
  }
  /**
   * A message handler invoked on a `'resize'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onResize(msg) {
  }
  /**
   * A message handler invoked on an `'update-request'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onUpdateRequest(msg) {
  }
  /**
   * A message handler invoked on a `'fit-request'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onFitRequest(msg) {
  }
  /**
   * A message handler invoked on an `'activate-request'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onActivateRequest(msg) {
  }
  /**
   * A message handler invoked on a `'before-show'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onBeforeShow(msg) {
  }
  /**
   * A message handler invoked on an `'after-show'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onAfterShow(msg) {
  }
  /**
   * A message handler invoked on a `'before-hide'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onBeforeHide(msg) {
  }
  /**
   * A message handler invoked on an `'after-hide'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onAfterHide(msg) {
  }
  /**
   * A message handler invoked on a `'before-attach'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onBeforeAttach(msg) {
  }
  /**
   * A message handler invoked on an `'after-attach'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onAfterAttach(msg) {
  }
  /**
   * A message handler invoked on a `'before-detach'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onBeforeDetach(msg) {
  }
  /**
   * A message handler invoked on an `'after-detach'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onAfterDetach(msg) {
  }
  /**
   * A message handler invoked on a `'child-added'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onChildAdded(msg) {
  }
  /**
   * A message handler invoked on a `'child-removed'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onChildRemoved(msg) {
  }
  _toggleHidden(hidden) {
    if (hidden) {
      switch (this._hiddenMode) {
        case _Widget.HiddenMode.Display:
          this.addClass("lm-mod-hidden");
          break;
        case _Widget.HiddenMode.Scale:
          this.node.style.transform = "scale(0)";
          this.node.setAttribute("aria-hidden", "true");
          break;
        case _Widget.HiddenMode.ContentVisibility:
          this.node.style.contentVisibility = "hidden";
          this.node.style.zIndex = "-1";
          this.node.style.opacity = "0";
          break;
      }
    } else {
      switch (this._hiddenMode) {
        case _Widget.HiddenMode.Display:
          this.removeClass("lm-mod-hidden");
          break;
        case _Widget.HiddenMode.Scale:
          this.node.style.transform = "";
          this.node.removeAttribute("aria-hidden");
          break;
        case _Widget.HiddenMode.ContentVisibility:
          this.node.style.contentVisibility = "";
          this.node.style.zIndex = "";
          this.node.style.opacity = "";
          break;
      }
    }
  }
};
(function(Widget2) {
  (function(HiddenMode) {
    HiddenMode[HiddenMode["Display"] = 0] = "Display";
    HiddenMode[HiddenMode["Scale"] = 1] = "Scale";
    HiddenMode[HiddenMode["ContentVisibility"] = 2] = "ContentVisibility";
  })(Widget2.HiddenMode || (Widget2.HiddenMode = {}));
  (function(Flag) {
    Flag[Flag["IsDisposed"] = 1] = "IsDisposed";
    Flag[Flag["IsAttached"] = 2] = "IsAttached";
    Flag[Flag["IsHidden"] = 4] = "IsHidden";
    Flag[Flag["IsVisible"] = 8] = "IsVisible";
    Flag[Flag["DisallowLayout"] = 16] = "DisallowLayout";
  })(Widget2.Flag || (Widget2.Flag = {}));
  (function(Msg) {
    Msg.BeforeShow = new import_messaging.Message("before-show");
    Msg.AfterShow = new import_messaging.Message("after-show");
    Msg.BeforeHide = new import_messaging.Message("before-hide");
    Msg.AfterHide = new import_messaging.Message("after-hide");
    Msg.BeforeAttach = new import_messaging.Message("before-attach");
    Msg.AfterAttach = new import_messaging.Message("after-attach");
    Msg.BeforeDetach = new import_messaging.Message("before-detach");
    Msg.AfterDetach = new import_messaging.Message("after-detach");
    Msg.ParentChanged = new import_messaging.Message("parent-changed");
    Msg.UpdateRequest = new import_messaging.ConflatableMessage("update-request");
    Msg.FitRequest = new import_messaging.ConflatableMessage("fit-request");
    Msg.ActivateRequest = new import_messaging.ConflatableMessage("activate-request");
    Msg.CloseRequest = new import_messaging.ConflatableMessage("close-request");
  })(Widget2.Msg || (Widget2.Msg = {}));
  class ChildMessage extends import_messaging.Message {
    /**
     * Construct a new child message.
     *
     * @param type - The message type.
     *
     * @param child - The child widget for the message.
     */
    constructor(type, child) {
      super(type);
      this.child = child;
    }
  }
  Widget2.ChildMessage = ChildMessage;
  class ResizeMessage extends import_messaging.Message {
    /**
     * Construct a new resize message.
     *
     * @param width - The **offset width** of the widget, or `-1` if
     *   the width is not known.
     *
     * @param height - The **offset height** of the widget, or `-1` if
     *   the height is not known.
     */
    constructor(width, height) {
      super("resize");
      this.width = width;
      this.height = height;
    }
  }
  Widget2.ResizeMessage = ResizeMessage;
  (function(ResizeMessage2) {
    ResizeMessage2.UnknownSize = new ResizeMessage2(-1, -1);
  })(ResizeMessage = Widget2.ResizeMessage || (Widget2.ResizeMessage = {}));
  function attach(widget, host, ref = null) {
    if (widget.parent) {
      throw new Error("Cannot attach a child widget.");
    }
    if (widget.isAttached || widget.node.isConnected) {
      throw new Error("Widget is already attached.");
    }
    if (!host.isConnected) {
      throw new Error("Host is not attached.");
    }
    import_messaging.MessageLoop.sendMessage(widget, Widget2.Msg.BeforeAttach);
    host.insertBefore(widget.node, ref);
    import_messaging.MessageLoop.sendMessage(widget, Widget2.Msg.AfterAttach);
  }
  Widget2.attach = attach;
  function detach(widget) {
    if (widget.parent) {
      throw new Error("Cannot detach a child widget.");
    }
    if (!widget.isAttached || !widget.node.isConnected) {
      throw new Error("Widget is not attached.");
    }
    import_messaging.MessageLoop.sendMessage(widget, Widget2.Msg.BeforeDetach);
    widget.node.parentNode.removeChild(widget.node);
    import_messaging.MessageLoop.sendMessage(widget, Widget2.Msg.AfterDetach);
  }
  Widget2.detach = detach;
})(Widget || (Widget = {}));
var Private$j;
(function(Private6) {
  Private6.titleProperty = new import_properties.AttachedProperty({
    name: "title",
    create: (owner) => new Title({ owner })
  });
  function createNode(options) {
    return options.node || document.createElement(options.tag || "div");
  }
  Private6.createNode = createNode;
})(Private$j || (Private$j = {}));
var Layout = class {
  /**
   * Construct a new layout.
   *
   * @param options - The options for initializing the layout.
   */
  constructor(options = {}) {
    this._disposed = false;
    this._parent = null;
    this._fitPolicy = options.fitPolicy || "set-min-size";
  }
  /**
   * Dispose of the resources held by the layout.
   *
   * #### Notes
   * This should be reimplemented to clear and dispose of the widgets.
   *
   * All reimplementations should call the superclass method.
   *
   * This method is called automatically when the parent is disposed.
   */
  dispose() {
    this._parent = null;
    this._disposed = true;
    import_signaling2.Signal.clearData(this);
    import_properties.AttachedProperty.clearData(this);
  }
  /**
   * Test whether the layout is disposed.
   */
  get isDisposed() {
    return this._disposed;
  }
  /**
   * Get the parent widget of the layout.
   */
  get parent() {
    return this._parent;
  }
  /**
   * Set the parent widget of the layout.
   *
   * #### Notes
   * This is set automatically when installing the layout on the parent
   * widget. The parent widget should not be set directly by user code.
   */
  set parent(value) {
    if (this._parent === value) {
      return;
    }
    if (this._parent) {
      throw new Error("Cannot change parent widget.");
    }
    if (value.layout !== this) {
      throw new Error("Invalid parent widget.");
    }
    this._parent = value;
    this.init();
  }
  /**
   * Get the fit policy for the layout.
   *
   * #### Notes
   * The fit policy controls the computed size constraints which are
   * applied to the parent widget by the layout.
   *
   * Some layout implementations may ignore the fit policy.
   */
  get fitPolicy() {
    return this._fitPolicy;
  }
  /**
   * Set the fit policy for the layout.
   *
   * #### Notes
   * The fit policy controls the computed size constraints which are
   * applied to the parent widget by the layout.
   *
   * Some layout implementations may ignore the fit policy.
   *
   * Changing the fit policy will clear the current size constraint
   * for the parent widget and then re-fit the parent.
   */
  set fitPolicy(value) {
    if (this._fitPolicy === value) {
      return;
    }
    this._fitPolicy = value;
    if (this._parent) {
      let style = this._parent.node.style;
      style.minWidth = "";
      style.minHeight = "";
      style.maxWidth = "";
      style.maxHeight = "";
      this._parent.fit();
    }
  }
  /**
   * Process a message sent to the parent widget.
   *
   * @param msg - The message sent to the parent widget.
   *
   * #### Notes
   * This method is called by the parent widget to process a message.
   *
   * Subclasses may reimplement this method as needed.
   */
  processParentMessage(msg) {
    switch (msg.type) {
      case "resize":
        this.onResize(msg);
        break;
      case "update-request":
        this.onUpdateRequest(msg);
        break;
      case "fit-request":
        this.onFitRequest(msg);
        break;
      case "before-show":
        this.onBeforeShow(msg);
        break;
      case "after-show":
        this.onAfterShow(msg);
        break;
      case "before-hide":
        this.onBeforeHide(msg);
        break;
      case "after-hide":
        this.onAfterHide(msg);
        break;
      case "before-attach":
        this.onBeforeAttach(msg);
        break;
      case "after-attach":
        this.onAfterAttach(msg);
        break;
      case "before-detach":
        this.onBeforeDetach(msg);
        break;
      case "after-detach":
        this.onAfterDetach(msg);
        break;
      case "child-removed":
        this.onChildRemoved(msg);
        break;
      case "child-shown":
        this.onChildShown(msg);
        break;
      case "child-hidden":
        this.onChildHidden(msg);
        break;
    }
  }
  /**
   * Perform layout initialization which requires the parent widget.
   *
   * #### Notes
   * This method is invoked immediately after the layout is installed
   * on the parent widget.
   *
   * The default implementation reparents all of the widgets to the
   * layout parent widget.
   *
   * Subclasses should reimplement this method and attach the child
   * widget nodes to the parent widget's node.
   */
  init() {
    for (const widget of this) {
      widget.parent = this.parent;
    }
  }
  /**
   * A message handler invoked on a `'resize'` message.
   *
   * #### Notes
   * The layout should ensure that its widgets are resized according
   * to the specified layout space, and that they are sent a `'resize'`
   * message if appropriate.
   *
   * The default implementation of this method sends an `UnknownSize`
   * resize message to all widgets.
   *
   * This may be reimplemented by subclasses as needed.
   */
  onResize(msg) {
    for (const widget of this) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.ResizeMessage.UnknownSize);
    }
  }
  /**
   * A message handler invoked on an `'update-request'` message.
   *
   * #### Notes
   * The layout should ensure that its widgets are resized according
   * to the available layout space, and that they are sent a `'resize'`
   * message if appropriate.
   *
   * The default implementation of this method sends an `UnknownSize`
   * resize message to all widgets.
   *
   * This may be reimplemented by subclasses as needed.
   */
  onUpdateRequest(msg) {
    for (const widget of this) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.ResizeMessage.UnknownSize);
    }
  }
  /**
   * A message handler invoked on a `'before-attach'` message.
   *
   * #### Notes
   * The default implementation of this method forwards the message
   * to all widgets. It assumes all widget nodes are attached to the
   * parent widget node.
   *
   * This may be reimplemented by subclasses as needed.
   */
  onBeforeAttach(msg) {
    for (const widget of this) {
      import_messaging.MessageLoop.sendMessage(widget, msg);
    }
  }
  /**
   * A message handler invoked on an `'after-attach'` message.
   *
   * #### Notes
   * The default implementation of this method forwards the message
   * to all widgets. It assumes all widget nodes are attached to the
   * parent widget node.
   *
   * This may be reimplemented by subclasses as needed.
   */
  onAfterAttach(msg) {
    for (const widget of this) {
      import_messaging.MessageLoop.sendMessage(widget, msg);
    }
  }
  /**
   * A message handler invoked on a `'before-detach'` message.
   *
   * #### Notes
   * The default implementation of this method forwards the message
   * to all widgets. It assumes all widget nodes are attached to the
   * parent widget node.
   *
   * This may be reimplemented by subclasses as needed.
   */
  onBeforeDetach(msg) {
    for (const widget of this) {
      import_messaging.MessageLoop.sendMessage(widget, msg);
    }
  }
  /**
   * A message handler invoked on an `'after-detach'` message.
   *
   * #### Notes
   * The default implementation of this method forwards the message
   * to all widgets. It assumes all widget nodes are attached to the
   * parent widget node.
   *
   * This may be reimplemented by subclasses as needed.
   */
  onAfterDetach(msg) {
    for (const widget of this) {
      import_messaging.MessageLoop.sendMessage(widget, msg);
    }
  }
  /**
   * A message handler invoked on a `'before-show'` message.
   *
   * #### Notes
   * The default implementation of this method forwards the message to
   * all non-hidden widgets. It assumes all widget nodes are attached
   * to the parent widget node.
   *
   * This may be reimplemented by subclasses as needed.
   */
  onBeforeShow(msg) {
    for (const widget of this) {
      if (!widget.isHidden) {
        import_messaging.MessageLoop.sendMessage(widget, msg);
      }
    }
  }
  /**
   * A message handler invoked on an `'after-show'` message.
   *
   * #### Notes
   * The default implementation of this method forwards the message to
   * all non-hidden widgets. It assumes all widget nodes are attached
   * to the parent widget node.
   *
   * This may be reimplemented by subclasses as needed.
   */
  onAfterShow(msg) {
    for (const widget of this) {
      if (!widget.isHidden) {
        import_messaging.MessageLoop.sendMessage(widget, msg);
      }
    }
  }
  /**
   * A message handler invoked on a `'before-hide'` message.
   *
   * #### Notes
   * The default implementation of this method forwards the message to
   * all non-hidden widgets. It assumes all widget nodes are attached
   * to the parent widget node.
   *
   * This may be reimplemented by subclasses as needed.
   */
  onBeforeHide(msg) {
    for (const widget of this) {
      if (!widget.isHidden) {
        import_messaging.MessageLoop.sendMessage(widget, msg);
      }
    }
  }
  /**
   * A message handler invoked on an `'after-hide'` message.
   *
   * #### Notes
   * The default implementation of this method forwards the message to
   * all non-hidden widgets. It assumes all widget nodes are attached
   * to the parent widget node.
   *
   * This may be reimplemented by subclasses as needed.
   */
  onAfterHide(msg) {
    for (const widget of this) {
      if (!widget.isHidden) {
        import_messaging.MessageLoop.sendMessage(widget, msg);
      }
    }
  }
  /**
   * A message handler invoked on a `'child-removed'` message.
   *
   * #### Notes
   * This will remove the child widget from the layout.
   *
   * Subclasses should **not** typically reimplement this method.
   */
  onChildRemoved(msg) {
    this.removeWidget(msg.child);
  }
  /**
   * A message handler invoked on a `'fit-request'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onFitRequest(msg) {
  }
  /**
   * A message handler invoked on a `'child-shown'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onChildShown(msg) {
  }
  /**
   * A message handler invoked on a `'child-hidden'` message.
   *
   * #### Notes
   * The default implementation of this handler is a no-op.
   */
  onChildHidden(msg) {
  }
};
(function(Layout2) {
  function getHorizontalAlignment(widget) {
    return Private$i.horizontalAlignmentProperty.get(widget);
  }
  Layout2.getHorizontalAlignment = getHorizontalAlignment;
  function setHorizontalAlignment(widget, value) {
    Private$i.horizontalAlignmentProperty.set(widget, value);
  }
  Layout2.setHorizontalAlignment = setHorizontalAlignment;
  function getVerticalAlignment(widget) {
    return Private$i.verticalAlignmentProperty.get(widget);
  }
  Layout2.getVerticalAlignment = getVerticalAlignment;
  function setVerticalAlignment(widget, value) {
    Private$i.verticalAlignmentProperty.set(widget, value);
  }
  Layout2.setVerticalAlignment = setVerticalAlignment;
})(Layout || (Layout = {}));
var LayoutItem = class {
  /**
   * Construct a new layout item.
   *
   * @param widget - The widget to be managed by the item.
   *
   * #### Notes
   * The widget will be set to absolute positioning.
   * The widget will use strict CSS containment.
   */
  constructor(widget) {
    this._top = NaN;
    this._left = NaN;
    this._width = NaN;
    this._height = NaN;
    this._minWidth = 0;
    this._minHeight = 0;
    this._maxWidth = Infinity;
    this._maxHeight = Infinity;
    this._disposed = false;
    this.widget = widget;
    this.widget.node.style.position = "absolute";
    this.widget.node.style.contain = "strict";
  }
  /**
   * Dispose of the the layout item.
   *
   * #### Notes
   * This will reset the positioning of the widget.
   */
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    let style = this.widget.node.style;
    style.position = "";
    style.top = "";
    style.left = "";
    style.width = "";
    style.height = "";
    style.contain = "";
  }
  /**
   * The computed minimum width of the widget.
   *
   * #### Notes
   * This value can be updated by calling the `fit` method.
   */
  get minWidth() {
    return this._minWidth;
  }
  /**
   * The computed minimum height of the widget.
   *
   * #### Notes
   * This value can be updated by calling the `fit` method.
   */
  get minHeight() {
    return this._minHeight;
  }
  /**
   * The computed maximum width of the widget.
   *
   * #### Notes
   * This value can be updated by calling the `fit` method.
   */
  get maxWidth() {
    return this._maxWidth;
  }
  /**
   * The computed maximum height of the widget.
   *
   * #### Notes
   * This value can be updated by calling the `fit` method.
   */
  get maxHeight() {
    return this._maxHeight;
  }
  /**
   * Whether the layout item is disposed.
   */
  get isDisposed() {
    return this._disposed;
  }
  /**
   * Whether the managed widget is hidden.
   */
  get isHidden() {
    return this.widget.isHidden;
  }
  /**
   * Whether the managed widget is visible.
   */
  get isVisible() {
    return this.widget.isVisible;
  }
  /**
   * Whether the managed widget is attached.
   */
  get isAttached() {
    return this.widget.isAttached;
  }
  /**
   * Update the computed size limits of the managed widget.
   */
  fit() {
    let limits = import_domutils2.ElementExt.sizeLimits(this.widget.node);
    this._minWidth = limits.minWidth;
    this._minHeight = limits.minHeight;
    this._maxWidth = limits.maxWidth;
    this._maxHeight = limits.maxHeight;
  }
  /**
   * Update the position and size of the managed widget.
   *
   * @param left - The left edge position of the layout box.
   *
   * @param top - The top edge position of the layout box.
   *
   * @param width - The width of the layout box.
   *
   * @param height - The height of the layout box.
   */
  update(left, top, width, height) {
    let clampW = Math.max(this._minWidth, Math.min(width, this._maxWidth));
    let clampH = Math.max(this._minHeight, Math.min(height, this._maxHeight));
    if (clampW < width) {
      switch (Layout.getHorizontalAlignment(this.widget)) {
        case "left":
          break;
        case "center":
          left += (width - clampW) / 2;
          break;
        case "right":
          left += width - clampW;
          break;
        default:
          throw "unreachable";
      }
    }
    if (clampH < height) {
      switch (Layout.getVerticalAlignment(this.widget)) {
        case "top":
          break;
        case "center":
          top += (height - clampH) / 2;
          break;
        case "bottom":
          top += height - clampH;
          break;
        default:
          throw "unreachable";
      }
    }
    let resized = false;
    let style = this.widget.node.style;
    if (this._top !== top) {
      this._top = top;
      style.top = `${top}px`;
    }
    if (this._left !== left) {
      this._left = left;
      style.left = `${left}px`;
    }
    if (this._width !== clampW) {
      resized = true;
      this._width = clampW;
      style.width = `${clampW}px`;
    }
    if (this._height !== clampH) {
      resized = true;
      this._height = clampH;
      style.height = `${clampH}px`;
    }
    if (resized) {
      let msg = new Widget.ResizeMessage(clampW, clampH);
      import_messaging.MessageLoop.sendMessage(this.widget, msg);
    }
  }
};
var Private$i;
(function(Private6) {
  Private6.horizontalAlignmentProperty = new import_properties.AttachedProperty({
    name: "horizontalAlignment",
    create: () => "center",
    changed: onAlignmentChanged
  });
  Private6.verticalAlignmentProperty = new import_properties.AttachedProperty({
    name: "verticalAlignment",
    create: () => "top",
    changed: onAlignmentChanged
  });
  function onAlignmentChanged(child) {
    if (child.parent && child.parent.layout) {
      child.parent.update();
    }
  }
})(Private$i || (Private$i = {}));
var PanelLayout = class extends Layout {
  constructor() {
    super(...arguments);
    this._widgets = [];
  }
  /**
   * Dispose of the resources held by the layout.
   *
   * #### Notes
   * This will clear and dispose all widgets in the layout.
   *
   * All reimplementations should call the superclass method.
   *
   * This method is called automatically when the parent is disposed.
   */
  dispose() {
    while (this._widgets.length > 0) {
      this._widgets.pop().dispose();
    }
    super.dispose();
  }
  /**
   * A read-only array of the widgets in the layout.
   */
  get widgets() {
    return this._widgets;
  }
  /**
   * Create an iterator over the widgets in the layout.
   *
   * @returns A new iterator over the widgets in the layout.
   */
  *[Symbol.iterator]() {
    yield* this._widgets;
  }
  /**
   * Add a widget to the end of the layout.
   *
   * @param widget - The widget to add to the layout.
   *
   * #### Notes
   * If the widget is already contained in the layout, it will be moved.
   */
  addWidget(widget) {
    this.insertWidget(this._widgets.length, widget);
  }
  /**
   * Insert a widget into the layout at the specified index.
   *
   * @param index - The index at which to insert the widget.
   *
   * @param widget - The widget to insert into the layout.
   *
   * #### Notes
   * The index will be clamped to the bounds of the widgets.
   *
   * If the widget is already added to the layout, it will be moved.
   *
   * #### Undefined Behavior
   * An `index` which is non-integral.
   */
  insertWidget(index, widget) {
    widget.parent = this.parent;
    let i = this._widgets.indexOf(widget);
    let j = Math.max(0, Math.min(index, this._widgets.length));
    if (i === -1) {
      import_algorithm2.ArrayExt.insert(this._widgets, j, widget);
      if (this.parent) {
        this.attachWidget(j, widget);
      }
      return;
    }
    if (j === this._widgets.length) {
      j--;
    }
    if (i === j) {
      return;
    }
    import_algorithm2.ArrayExt.move(this._widgets, i, j);
    if (this.parent) {
      this.moveWidget(i, j, widget);
    }
  }
  /**
   * Remove a widget from the layout.
   *
   * @param widget - The widget to remove from the layout.
   *
   * #### Notes
   * A widget is automatically removed from the layout when its `parent`
   * is set to `null`. This method should only be invoked directly when
   * removing a widget from a layout which has yet to be installed on a
   * parent widget.
   *
   * This method does *not* modify the widget's `parent`.
   */
  removeWidget(widget) {
    this.removeWidgetAt(this._widgets.indexOf(widget));
  }
  /**
   * Remove the widget at a given index from the layout.
   *
   * @param index - The index of the widget to remove.
   *
   * #### Notes
   * A widget is automatically removed from the layout when its `parent`
   * is set to `null`. This method should only be invoked directly when
   * removing a widget from a layout which has yet to be installed on a
   * parent widget.
   *
   * This method does *not* modify the widget's `parent`.
   *
   * #### Undefined Behavior
   * An `index` which is non-integral.
   */
  removeWidgetAt(index) {
    let widget = import_algorithm2.ArrayExt.removeAt(this._widgets, index);
    if (widget && this.parent) {
      this.detachWidget(index, widget);
    }
  }
  /**
   * Perform layout initialization which requires the parent widget.
   */
  init() {
    super.init();
    let index = 0;
    for (const widget of this) {
      this.attachWidget(index++, widget);
    }
  }
  /**
   * Attach a widget to the parent's DOM node.
   *
   * @param index - The current index of the widget in the layout.
   *
   * @param widget - The widget to attach to the parent.
   *
   * #### Notes
   * This method is called automatically by the panel layout at the
   * appropriate time. It should not be called directly by user code.
   *
   * The default implementation adds the widgets's node to the parent's
   * node at the proper location, and sends the appropriate attach
   * messages to the widget if the parent is attached to the DOM.
   *
   * Subclasses may reimplement this method to control how the widget's
   * node is added to the parent's node.
   */
  attachWidget(index, widget) {
    let ref = this.parent.node.children[index];
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.BeforeAttach);
    }
    this.parent.node.insertBefore(widget.node, ref);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.AfterAttach);
    }
  }
  /**
   * Move a widget in the parent's DOM node.
   *
   * @param fromIndex - The previous index of the widget in the layout.
   *
   * @param toIndex - The current index of the widget in the layout.
   *
   * @param widget - The widget to move in the parent.
   *
   * #### Notes
   * This method is called automatically by the panel layout at the
   * appropriate time. It should not be called directly by user code.
   *
   * The default implementation moves the widget's node to the proper
   * location in the parent's node and sends the appropriate attach and
   * detach messages to the widget if the parent is attached to the DOM.
   *
   * Subclasses may reimplement this method to control how the widget's
   * node is moved in the parent's node.
   */
  moveWidget(fromIndex, toIndex, widget) {
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.BeforeDetach);
    }
    this.parent.node.removeChild(widget.node);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.AfterDetach);
    }
    let ref = this.parent.node.children[toIndex];
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.BeforeAttach);
    }
    this.parent.node.insertBefore(widget.node, ref);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.AfterAttach);
    }
  }
  /**
   * Detach a widget from the parent's DOM node.
   *
   * @param index - The previous index of the widget in the layout.
   *
   * @param widget - The widget to detach from the parent.
   *
   * #### Notes
   * This method is called automatically by the panel layout at the
   * appropriate time. It should not be called directly by user code.
   *
   * The default implementation removes the widget's node from the
   * parent's node, and sends the appropriate detach messages to the
   * widget if the parent is attached to the DOM.
   *
   * Subclasses may reimplement this method to control how the widget's
   * node is removed from the parent's node.
   */
  detachWidget(index, widget) {
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.BeforeDetach);
    }
    this.parent.node.removeChild(widget.node);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.AfterDetach);
    }
  }
};
var Utils;
(function(Utils2) {
  function clampDimension(value) {
    return Math.max(0, Math.floor(value));
  }
  Utils2.clampDimension = clampDimension;
})(Utils || (Utils = {}));
var Utils$1 = Utils;
var SplitLayout = class _SplitLayout extends PanelLayout {
  /**
   * Construct a new split layout.
   *
   * @param options - The options for initializing the layout.
   */
  constructor(options) {
    super();
    this.widgetOffset = 0;
    this._fixed = 0;
    this._spacing = 4;
    this._dirty = false;
    this._hasNormedSizes = false;
    this._sizers = [];
    this._items = [];
    this._handles = [];
    this._box = null;
    this._alignment = "start";
    this._orientation = "horizontal";
    this.renderer = options.renderer;
    if (options.orientation !== void 0) {
      this._orientation = options.orientation;
    }
    if (options.alignment !== void 0) {
      this._alignment = options.alignment;
    }
    if (options.spacing !== void 0) {
      this._spacing = Utils.clampDimension(options.spacing);
    }
  }
  /**
   * Dispose of the resources held by the layout.
   */
  dispose() {
    for (const item of this._items) {
      item.dispose();
    }
    this._box = null;
    this._items.length = 0;
    this._sizers.length = 0;
    this._handles.length = 0;
    super.dispose();
  }
  /**
   * Get the layout orientation for the split layout.
   */
  get orientation() {
    return this._orientation;
  }
  /**
   * Set the layout orientation for the split layout.
   */
  set orientation(value) {
    if (this._orientation === value) {
      return;
    }
    this._orientation = value;
    if (!this.parent) {
      return;
    }
    this.parent.dataset["orientation"] = value;
    this.parent.fit();
  }
  /**
   * Get the content alignment for the split layout.
   *
   * #### Notes
   * This is the alignment of the widgets in the layout direction.
   *
   * The alignment has no effect if the widgets can expand  to fill the
   * entire split layout.
   */
  get alignment() {
    return this._alignment;
  }
  /**
   * Set the content alignment for the split layout.
   *
   * #### Notes
   * This is the alignment of the widgets in the layout direction.
   *
   * The alignment has no effect if the widgets can expand  to fill the
   * entire split layout.
   */
  set alignment(value) {
    if (this._alignment === value) {
      return;
    }
    this._alignment = value;
    if (!this.parent) {
      return;
    }
    this.parent.dataset["alignment"] = value;
    this.parent.update();
  }
  /**
   * Get the inter-element spacing for the split layout.
   */
  get spacing() {
    return this._spacing;
  }
  /**
   * Set the inter-element spacing for the split layout.
   */
  set spacing(value) {
    value = Utils.clampDimension(value);
    if (this._spacing === value) {
      return;
    }
    this._spacing = value;
    if (!this.parent) {
      return;
    }
    this.parent.fit();
  }
  /**
   * A read-only array of the split handles in the layout.
   */
  get handles() {
    return this._handles;
  }
  /**
   * Get the absolute sizes of the widgets in the layout.
   *
   * @returns A new array of the absolute sizes of the widgets.
   *
   * This method **does not** measure the DOM nodes.
   */
  absoluteSizes() {
    return this._sizers.map((sizer) => sizer.size);
  }
  /**
   * Get the relative sizes of the widgets in the layout.
   *
   * @returns A new array of the relative sizes of the widgets.
   *
   * #### Notes
   * The returned sizes reflect the sizes of the widgets normalized
   * relative to their siblings.
   *
   * This method **does not** measure the DOM nodes.
   */
  relativeSizes() {
    return Private$h.normalize(this._sizers.map((sizer) => sizer.size));
  }
  /**
   * Set the relative sizes for the widgets in the layout.
   *
   * @param sizes - The relative sizes for the widgets in the panel.
   * @param update - Update the layout after setting relative sizes.
   * Default is True.
   *
   * #### Notes
   * Extra values are ignored, too few will yield an undefined layout.
   *
   * The actual geometry of the DOM nodes is updated asynchronously.
   */
  setRelativeSizes(sizes, update = true) {
    let n = this._sizers.length;
    let temp = sizes.slice(0, n);
    while (temp.length < n) {
      temp.push(0);
    }
    let normed = Private$h.normalize(temp);
    for (let i = 0; i < n; ++i) {
      let sizer = this._sizers[i];
      sizer.sizeHint = normed[i];
      sizer.size = normed[i];
    }
    this._hasNormedSizes = true;
    if (update && this.parent) {
      this.parent.update();
    }
  }
  /**
   * Move the offset position of a split handle.
   *
   * @param index - The index of the handle of the interest.
   *
   * @param position - The desired offset position of the handle.
   *
   * #### Notes
   * The position is relative to the offset parent.
   *
   * This will move the handle as close as possible to the desired
   * position. The sibling widgets will be adjusted as necessary.
   */
  moveHandle(index, position) {
    let handle = this._handles[index];
    if (!handle || handle.classList.contains("lm-mod-hidden")) {
      return;
    }
    let delta;
    if (this._orientation === "horizontal") {
      delta = position - handle.offsetLeft;
    } else {
      delta = position - handle.offsetTop;
    }
    if (delta === 0) {
      return;
    }
    for (let sizer of this._sizers) {
      if (sizer.size > 0) {
        sizer.sizeHint = sizer.size;
      }
    }
    BoxEngine.adjust(this._sizers, index, delta);
    if (this.parent) {
      this.parent.update();
    }
  }
  /**
   * Perform layout initialization which requires the parent widget.
   */
  init() {
    this.parent.dataset["orientation"] = this.orientation;
    this.parent.dataset["alignment"] = this.alignment;
    super.init();
  }
  /**
   * Attach a widget to the parent's DOM node.
   *
   * @param index - The current index of the widget in the layout.
   *
   * @param widget - The widget to attach to the parent.
   *
   * #### Notes
   * This is a reimplementation of the superclass method.
   */
  attachWidget(index, widget) {
    let item = new LayoutItem(widget);
    let handle = Private$h.createHandle(this.renderer);
    let average = Private$h.averageSize(this._sizers);
    let sizer = Private$h.createSizer(average);
    import_algorithm2.ArrayExt.insert(this._items, index, item);
    import_algorithm2.ArrayExt.insert(this._sizers, index, sizer);
    import_algorithm2.ArrayExt.insert(this._handles, index, handle);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.BeforeAttach);
    }
    this.parent.node.appendChild(widget.node);
    this.parent.node.appendChild(handle);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.AfterAttach);
    }
    this.parent.fit();
  }
  /**
   * Move a widget in the parent's DOM node.
   *
   * @param fromIndex - The previous index of the widget in the layout.
   *
   * @param toIndex - The current index of the widget in the layout.
   *
   * @param widget - The widget to move in the parent.
   *
   * #### Notes
   * This is a reimplementation of the superclass method.
   */
  moveWidget(fromIndex, toIndex, widget) {
    import_algorithm2.ArrayExt.move(this._items, fromIndex, toIndex);
    import_algorithm2.ArrayExt.move(this._sizers, fromIndex, toIndex);
    import_algorithm2.ArrayExt.move(this._handles, fromIndex, toIndex);
    this.parent.fit();
  }
  /**
   * Detach a widget from the parent's DOM node.
   *
   * @param index - The previous index of the widget in the layout.
   *
   * @param widget - The widget to detach from the parent.
   *
   * #### Notes
   * This is a reimplementation of the superclass method.
   */
  detachWidget(index, widget) {
    let item = import_algorithm2.ArrayExt.removeAt(this._items, index);
    let handle = import_algorithm2.ArrayExt.removeAt(this._handles, index);
    import_algorithm2.ArrayExt.removeAt(this._sizers, index);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.BeforeDetach);
    }
    this.parent.node.removeChild(widget.node);
    this.parent.node.removeChild(handle);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.AfterDetach);
    }
    item.dispose();
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'before-show'` message.
   */
  onBeforeShow(msg) {
    super.onBeforeShow(msg);
    this.parent.update();
  }
  /**
   * A message handler invoked on a `'before-attach'` message.
   */
  onBeforeAttach(msg) {
    super.onBeforeAttach(msg);
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'child-shown'` message.
   */
  onChildShown(msg) {
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'child-hidden'` message.
   */
  onChildHidden(msg) {
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'resize'` message.
   */
  onResize(msg) {
    if (this.parent.isVisible) {
      this._update(msg.width, msg.height);
    }
  }
  /**
   * A message handler invoked on an `'update-request'` message.
   */
  onUpdateRequest(msg) {
    if (this.parent.isVisible) {
      this._update(-1, -1);
    }
  }
  /**
   * A message handler invoked on a `'fit-request'` message.
   */
  onFitRequest(msg) {
    if (this.parent.isAttached) {
      this._fit();
    }
  }
  /**
   * Update the item position.
   *
   * @param i Item index
   * @param isHorizontal Whether the layout is horizontal or not
   * @param left Left position in pixels
   * @param top Top position in pixels
   * @param height Item height
   * @param width Item width
   * @param size Item size
   */
  updateItemPosition(i, isHorizontal, left, top, height, width, size) {
    const item = this._items[i];
    if (item.isHidden) {
      return;
    }
    let handleStyle = this._handles[i].style;
    if (isHorizontal) {
      left += this.widgetOffset;
      item.update(left, top, size, height);
      left += size;
      handleStyle.top = `${top}px`;
      handleStyle.left = `${left}px`;
      handleStyle.width = `${this._spacing}px`;
      handleStyle.height = `${height}px`;
    } else {
      top += this.widgetOffset;
      item.update(left, top, width, size);
      top += size;
      handleStyle.top = `${top}px`;
      handleStyle.left = `${left}px`;
      handleStyle.width = `${width}px`;
      handleStyle.height = `${this._spacing}px`;
    }
  }
  /**
   * Fit the layout to the total size required by the widgets.
   */
  _fit() {
    let nVisible = 0;
    let lastHandleIndex = -1;
    for (let i = 0, n = this._items.length; i < n; ++i) {
      if (this._items[i].isHidden) {
        this._handles[i].classList.add("lm-mod-hidden");
      } else {
        this._handles[i].classList.remove("lm-mod-hidden");
        lastHandleIndex = i;
        nVisible++;
      }
    }
    if (lastHandleIndex !== -1) {
      this._handles[lastHandleIndex].classList.add("lm-mod-hidden");
    }
    this._fixed = this._spacing * Math.max(0, nVisible - 1) + this.widgetOffset * this._items.length;
    let horz = this._orientation === "horizontal";
    let minW = horz ? this._fixed : 0;
    let minH = horz ? 0 : this._fixed;
    for (let i = 0, n = this._items.length; i < n; ++i) {
      let item = this._items[i];
      let sizer = this._sizers[i];
      if (sizer.size > 0) {
        sizer.sizeHint = sizer.size;
      }
      if (item.isHidden) {
        sizer.minSize = 0;
        sizer.maxSize = 0;
        continue;
      }
      item.fit();
      sizer.stretch = _SplitLayout.getStretch(item.widget);
      if (horz) {
        sizer.minSize = item.minWidth;
        sizer.maxSize = item.maxWidth;
        minW += item.minWidth;
        minH = Math.max(minH, item.minHeight);
      } else {
        sizer.minSize = item.minHeight;
        sizer.maxSize = item.maxHeight;
        minH += item.minHeight;
        minW = Math.max(minW, item.minWidth);
      }
    }
    let box = this._box = import_domutils2.ElementExt.boxSizing(this.parent.node);
    minW += box.horizontalSum;
    minH += box.verticalSum;
    let style = this.parent.node.style;
    style.minWidth = `${minW}px`;
    style.minHeight = `${minH}px`;
    this._dirty = true;
    if (this.parent.parent) {
      import_messaging.MessageLoop.sendMessage(this.parent.parent, Widget.Msg.FitRequest);
    }
    if (this._dirty) {
      import_messaging.MessageLoop.sendMessage(this.parent, Widget.Msg.UpdateRequest);
    }
  }
  /**
   * Update the layout position and size of the widgets.
   *
   * The parent offset dimensions should be `-1` if unknown.
   */
  _update(offsetWidth, offsetHeight) {
    this._dirty = false;
    let nVisible = 0;
    for (let i = 0, n = this._items.length; i < n; ++i) {
      nVisible += +!this._items[i].isHidden;
    }
    if (nVisible === 0 && this.widgetOffset === 0) {
      return;
    }
    if (offsetWidth < 0) {
      offsetWidth = this.parent.node.offsetWidth;
    }
    if (offsetHeight < 0) {
      offsetHeight = this.parent.node.offsetHeight;
    }
    if (!this._box) {
      this._box = import_domutils2.ElementExt.boxSizing(this.parent.node);
    }
    let top = this._box.paddingTop;
    let left = this._box.paddingLeft;
    let width = offsetWidth - this._box.horizontalSum;
    let height = offsetHeight - this._box.verticalSum;
    let extra = 0;
    let offset = 0;
    let horz = this._orientation === "horizontal";
    if (nVisible > 0) {
      let space;
      if (horz) {
        space = Math.max(0, width - this._fixed);
      } else {
        space = Math.max(0, height - this._fixed);
      }
      if (this._hasNormedSizes) {
        for (let sizer of this._sizers) {
          sizer.sizeHint *= space;
        }
        this._hasNormedSizes = false;
      }
      let delta = BoxEngine.calc(this._sizers, space);
      if (delta > 0) {
        switch (this._alignment) {
          case "start":
            break;
          case "center":
            extra = 0;
            offset = delta / 2;
            break;
          case "end":
            extra = 0;
            offset = delta;
            break;
          case "justify":
            extra = delta / nVisible;
            offset = 0;
            break;
          default:
            throw "unreachable";
        }
      }
    }
    for (let i = 0, n = this._items.length; i < n; ++i) {
      const item = this._items[i];
      const size = item.isHidden ? 0 : this._sizers[i].size + extra;
      this.updateItemPosition(i, horz, horz ? left + offset : left, horz ? top : top + offset, height, width, size);
      const fullOffset = this.widgetOffset + (this._handles[i].classList.contains("lm-mod-hidden") ? 0 : this._spacing);
      if (horz) {
        left += size + fullOffset;
      } else {
        top += size + fullOffset;
      }
    }
  }
};
(function(SplitLayout2) {
  function getStretch(widget) {
    return Private$h.stretchProperty.get(widget);
  }
  SplitLayout2.getStretch = getStretch;
  function setStretch(widget, value) {
    Private$h.stretchProperty.set(widget, value);
  }
  SplitLayout2.setStretch = setStretch;
})(SplitLayout || (SplitLayout = {}));
var Private$h;
(function(Private6) {
  Private6.stretchProperty = new import_properties.AttachedProperty({
    name: "stretch",
    create: () => 0,
    coerce: (owner, value) => Math.max(0, Math.floor(value)),
    changed: onChildSizingChanged
  });
  function createSizer(size) {
    let sizer = new BoxSizer();
    sizer.sizeHint = Math.floor(size);
    return sizer;
  }
  Private6.createSizer = createSizer;
  function createHandle(renderer) {
    let handle = renderer.createHandle();
    handle.style.position = "absolute";
    handle.style.contain = "style";
    return handle;
  }
  Private6.createHandle = createHandle;
  function averageSize(sizers) {
    return sizers.reduce((v, s) => v + s.size, 0) / sizers.length || 0;
  }
  Private6.averageSize = averageSize;
  function normalize(values) {
    let n = values.length;
    if (n === 0) {
      return [];
    }
    let sum = values.reduce((a, b) => a + Math.abs(b), 0);
    return sum === 0 ? values.map((v) => 1 / n) : values.map((v) => v / sum);
  }
  Private6.normalize = normalize;
  function onChildSizingChanged(child) {
    if (child.parent && child.parent.layout instanceof SplitLayout) {
      child.parent.fit();
    }
  }
})(Private$h || (Private$h = {}));
var AccordionLayout = class extends SplitLayout {
  /**
   * Construct a new accordion layout.
   *
   * @param options - The options for initializing the layout.
   *
   * #### Notes
   * The default orientation will be vertical.
   *
   * Titles must be rotated for horizontal accordion panel using CSS: see accordionpanel.css
   */
  constructor(options) {
    super({ ...options, orientation: options.orientation || "vertical" });
    this._titles = [];
    this.titleSpace = options.titleSpace || 22;
  }
  /**
   * The section title height or width depending on the orientation.
   */
  get titleSpace() {
    return this.widgetOffset;
  }
  set titleSpace(value) {
    value = Utils$1.clampDimension(value);
    if (this.widgetOffset === value) {
      return;
    }
    this.widgetOffset = value;
    if (!this.parent) {
      return;
    }
    this.parent.fit();
  }
  /**
   * A read-only array of the section titles in the panel.
   */
  get titles() {
    return this._titles;
  }
  /**
   * Dispose of the resources held by the layout.
   */
  dispose() {
    if (this.isDisposed) {
      return;
    }
    this._titles.length = 0;
    super.dispose();
  }
  updateTitle(index, widget) {
    const oldTitle = this._titles[index];
    const expanded = oldTitle.classList.contains("lm-mod-expanded");
    const newTitle = Private$g.createTitle(this.renderer, widget.title, expanded);
    this._titles[index] = newTitle;
    this.parent.node.replaceChild(newTitle, oldTitle);
  }
  /**
   * Insert a widget into the layout at the specified index.
   *
   * @param index - The index at which to insert the widget.
   *
   * @param widget - The widget to insert into the layout.
   *
   * #### Notes
   * The index will be clamped to the bounds of the widgets.
   *
   * If the widget is already added to the layout, it will be moved.
   *
   * #### Undefined Behavior
   * An `index` which is non-integral.
   */
  insertWidget(index, widget) {
    if (!widget.id) {
      widget.id = `id-${import_coreutils4.UUID.uuid4()}`;
    }
    super.insertWidget(index, widget);
  }
  /**
   * Attach a widget to the parent's DOM node.
   *
   * @param index - The current index of the widget in the layout.
   *
   * @param widget - The widget to attach to the parent.
   */
  attachWidget(index, widget) {
    const title = Private$g.createTitle(this.renderer, widget.title, !widget.isHidden);
    import_algorithm2.ArrayExt.insert(this._titles, index, title);
    this.parent.node.appendChild(title);
    widget.node.setAttribute("role", "region");
    widget.node.setAttribute("aria-labelledby", title.id);
    super.attachWidget(index, widget);
  }
  /**
   * Move a widget in the parent's DOM node.
   *
   * @param fromIndex - The previous index of the widget in the layout.
   *
   * @param toIndex - The current index of the widget in the layout.
   *
   * @param widget - The widget to move in the parent.
   */
  moveWidget(fromIndex, toIndex, widget) {
    import_algorithm2.ArrayExt.move(this._titles, fromIndex, toIndex);
    super.moveWidget(fromIndex, toIndex, widget);
  }
  /**
   * Detach a widget from the parent's DOM node.
   *
   * @param index - The previous index of the widget in the layout.
   *
   * @param widget - The widget to detach from the parent.
   *
   * #### Notes
   * This is a reimplementation of the superclass method.
   */
  detachWidget(index, widget) {
    const title = import_algorithm2.ArrayExt.removeAt(this._titles, index);
    this.parent.node.removeChild(title);
    super.detachWidget(index, widget);
  }
  /**
   * Update the item position.
   *
   * @param i Item index
   * @param isHorizontal Whether the layout is horizontal or not
   * @param left Left position in pixels
   * @param top Top position in pixels
   * @param height Item height
   * @param width Item width
   * @param size Item size
   */
  updateItemPosition(i, isHorizontal, left, top, height, width, size) {
    const titleStyle = this._titles[i].style;
    titleStyle.top = `${top}px`;
    titleStyle.left = `${left}px`;
    titleStyle.height = `${this.widgetOffset}px`;
    if (isHorizontal) {
      titleStyle.width = `${height}px`;
    } else {
      titleStyle.width = `${width}px`;
    }
    super.updateItemPosition(i, isHorizontal, left, top, height, width, size);
  }
};
var Private$g;
(function(Private6) {
  function createTitle(renderer, data, expanded = true) {
    const title = renderer.createSectionTitle(data);
    title.style.position = "absolute";
    title.style.contain = "strict";
    title.setAttribute("aria-label", `${data.label} Section`);
    title.setAttribute("aria-expanded", expanded ? "true" : "false");
    title.setAttribute("aria-controls", data.owner.id);
    if (expanded) {
      title.classList.add("lm-mod-expanded");
    }
    return title;
  }
  Private6.createTitle = createTitle;
})(Private$g || (Private$g = {}));
var Panel = class extends Widget {
  /**
   * Construct a new panel.
   *
   * @param options - The options for initializing the panel.
   */
  constructor(options = {}) {
    super();
    this.addClass("lm-Panel");
    this.layout = Private$f.createLayout(options);
  }
  /**
   * A read-only array of the widgets in the panel.
   */
  get widgets() {
    return this.layout.widgets;
  }
  /**
   * Add a widget to the end of the panel.
   *
   * @param widget - The widget to add to the panel.
   *
   * #### Notes
   * If the widget is already contained in the panel, it will be moved.
   */
  addWidget(widget) {
    this.layout.addWidget(widget);
  }
  /**
   * Insert a widget at the specified index.
   *
   * @param index - The index at which to insert the widget.
   *
   * @param widget - The widget to insert into to the panel.
   *
   * #### Notes
   * If the widget is already contained in the panel, it will be moved.
   */
  insertWidget(index, widget) {
    this.layout.insertWidget(index, widget);
  }
};
var Private$f;
(function(Private6) {
  function createLayout(options) {
    return options.layout || new PanelLayout();
  }
  Private6.createLayout = createLayout;
})(Private$f || (Private$f = {}));
var SplitPanel = class extends Panel {
  /**
   * Construct a new split panel.
   *
   * @param options - The options for initializing the split panel.
   */
  constructor(options = {}) {
    super({ layout: Private$e.createLayout(options) });
    this._handleMoved = new import_signaling2.Signal(this);
    this._pressData = null;
    this.addClass("lm-SplitPanel");
  }
  /**
   * Dispose of the resources held by the panel.
   */
  dispose() {
    this._releaseMouse();
    super.dispose();
  }
  /**
   * Get the layout orientation for the split panel.
   */
  get orientation() {
    return this.layout.orientation;
  }
  /**
   * Set the layout orientation for the split panel.
   */
  set orientation(value) {
    this.layout.orientation = value;
  }
  /**
   * Get the content alignment for the split panel.
   *
   * #### Notes
   * This is the alignment of the widgets in the layout direction.
   *
   * The alignment has no effect if the widgets can expand to fill the
   * entire split panel.
   */
  get alignment() {
    return this.layout.alignment;
  }
  /**
   * Set the content alignment for the split panel.
   *
   * #### Notes
   * This is the alignment of the widgets in the layout direction.
   *
   * The alignment has no effect if the widgets can expand to fill the
   * entire split panel.
   */
  set alignment(value) {
    this.layout.alignment = value;
  }
  /**
   * Get the inter-element spacing for the split panel.
   */
  get spacing() {
    return this.layout.spacing;
  }
  /**
   * Set the inter-element spacing for the split panel.
   */
  set spacing(value) {
    this.layout.spacing = value;
  }
  /**
   * The renderer used by the split panel.
   */
  get renderer() {
    return this.layout.renderer;
  }
  /**
   * A signal emitted when a split handle has moved.
   */
  get handleMoved() {
    return this._handleMoved;
  }
  /**
   * A read-only array of the split handles in the panel.
   */
  get handles() {
    return this.layout.handles;
  }
  /**
   * Get the relative sizes of the widgets in the panel.
   *
   * @returns A new array of the relative sizes of the widgets.
   *
   * #### Notes
   * The returned sizes reflect the sizes of the widgets normalized
   * relative to their siblings.
   *
   * This method **does not** measure the DOM nodes.
   */
  relativeSizes() {
    return this.layout.relativeSizes();
  }
  /**
   * Set the relative sizes for the widgets in the panel.
   *
   * @param sizes - The relative sizes for the widgets in the panel.
   * @param update - Update the layout after setting relative sizes.
   * Default is True.
   *
   * #### Notes
   * Extra values are ignored, too few will yield an undefined layout.
   *
   * The actual geometry of the DOM nodes is updated asynchronously.
   */
  setRelativeSizes(sizes, update = true) {
    this.layout.setRelativeSizes(sizes, update);
  }
  /**
   * Handle the DOM events for the split panel.
   *
   * @param event - The DOM event sent to the panel.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the panel's DOM node. It should
   * not be called directly by user code.
   */
  handleEvent(event) {
    switch (event.type) {
      case "pointerdown":
        this._evtPointerDown(event);
        break;
      case "pointermove":
        this._evtPointerMove(event);
        break;
      case "pointerup":
        this._evtPointerUp(event);
        break;
      case "keydown":
        this._evtKeyDown(event);
        break;
      case "contextmenu":
        event.preventDefault();
        event.stopPropagation();
        break;
    }
  }
  /**
   * A message handler invoked on a `'before-attach'` message.
   */
  onBeforeAttach(msg) {
    this.node.addEventListener("pointerdown", this);
  }
  /**
   * A message handler invoked on an `'after-detach'` message.
   */
  onAfterDetach(msg) {
    this.node.removeEventListener("pointerdown", this);
    this._releaseMouse();
  }
  /**
   * A message handler invoked on a `'child-added'` message.
   */
  onChildAdded(msg) {
    msg.child.addClass("lm-SplitPanel-child");
    this._releaseMouse();
  }
  /**
   * A message handler invoked on a `'child-removed'` message.
   */
  onChildRemoved(msg) {
    msg.child.removeClass("lm-SplitPanel-child");
    this._releaseMouse();
  }
  /**
   * Handle the `'keydown'` event for the split panel.
   */
  _evtKeyDown(event) {
    if (this._pressData) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.keyCode === 27) {
      this._releaseMouse();
    }
  }
  /**
   * Handle the `'pointerdown'` event for the split panel.
   */
  _evtPointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    let layout = this.layout;
    let index = import_algorithm2.ArrayExt.findFirstIndex(layout.handles, (handle2) => {
      return handle2.contains(event.target);
    });
    if (index === -1) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    document.addEventListener("pointerup", this, true);
    document.addEventListener("pointermove", this, true);
    document.addEventListener("keydown", this, true);
    document.addEventListener("contextmenu", this, true);
    let delta;
    let handle = layout.handles[index];
    let rect = handle.getBoundingClientRect();
    if (layout.orientation === "horizontal") {
      delta = event.clientX - rect.left;
    } else {
      delta = event.clientY - rect.top;
    }
    let style = window.getComputedStyle(handle);
    let override = Drag.overrideCursor(style.cursor);
    this._pressData = { index, delta, override };
  }
  /**
   * Handle the `'pointermove'` event for the split panel.
   */
  _evtPointerMove(event) {
    event.preventDefault();
    event.stopPropagation();
    let pos;
    let layout = this.layout;
    let rect = this.node.getBoundingClientRect();
    if (layout.orientation === "horizontal") {
      pos = event.clientX - rect.left - this._pressData.delta;
    } else {
      pos = event.clientY - rect.top - this._pressData.delta;
    }
    layout.moveHandle(this._pressData.index, pos);
  }
  /**
   * Handle the `'pointerup'` event for the split panel.
   */
  _evtPointerUp(event) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this._releaseMouse();
  }
  /**
   * Release the mouse grab for the split panel.
   */
  _releaseMouse() {
    if (!this._pressData) {
      return;
    }
    this._pressData.override.dispose();
    this._pressData = null;
    this._handleMoved.emit();
    document.removeEventListener("keydown", this, true);
    document.removeEventListener("pointerup", this, true);
    document.removeEventListener("pointermove", this, true);
    document.removeEventListener("contextmenu", this, true);
  }
};
(function(SplitPanel2) {
  class Renderer {
    /**
     * Create a new handle for use with a split panel.
     *
     * @returns A new handle element for a split panel.
     */
    createHandle() {
      let handle = document.createElement("div");
      handle.className = "lm-SplitPanel-handle";
      return handle;
    }
  }
  SplitPanel2.Renderer = Renderer;
  SplitPanel2.defaultRenderer = new Renderer();
  function getStretch(widget) {
    return SplitLayout.getStretch(widget);
  }
  SplitPanel2.getStretch = getStretch;
  function setStretch(widget, value) {
    SplitLayout.setStretch(widget, value);
  }
  SplitPanel2.setStretch = setStretch;
})(SplitPanel || (SplitPanel = {}));
var Private$e;
(function(Private6) {
  function createLayout(options) {
    return options.layout || new SplitLayout({
      renderer: options.renderer || SplitPanel.defaultRenderer,
      orientation: options.orientation,
      alignment: options.alignment,
      spacing: options.spacing
    });
  }
  Private6.createLayout = createLayout;
})(Private$e || (Private$e = {}));
var AccordionPanel = class extends SplitPanel {
  /**
   * Construct a new accordion panel.
   *
   * @param options - The options for initializing the accordion panel.
   *
   */
  constructor(options = {}) {
    super({ ...options, layout: Private$d.createLayout(options) });
    this._widgetSizesCache = /* @__PURE__ */ new WeakMap();
    this._expansionToggled = new import_signaling2.Signal(this);
    this.addClass("lm-AccordionPanel");
  }
  /**
   * The renderer used by the accordion panel.
   */
  get renderer() {
    return this.layout.renderer;
  }
  /**
   * The section title space.
   *
   * This is the height if the panel is vertical and the width if it is
   * horizontal.
   */
  get titleSpace() {
    return this.layout.titleSpace;
  }
  set titleSpace(value) {
    this.layout.titleSpace = value;
  }
  /**
   * A read-only array of the section titles in the panel.
   */
  get titles() {
    return this.layout.titles;
  }
  /**
   * A signal emitted when a widget of the AccordionPanel is collapsed or expanded.
   */
  get expansionToggled() {
    return this._expansionToggled;
  }
  /**
   * Add a widget to the end of the panel.
   *
   * @param widget - The widget to add to the panel.
   *
   * #### Notes
   * If the widget is already contained in the panel, it will be moved.
   */
  addWidget(widget) {
    super.addWidget(widget);
    widget.title.changed.connect(this._onTitleChanged, this);
  }
  /**
   * Collapse the widget at position `index`.
   *
   * #### Notes
   * If no widget is found for `index`, this will bail.
   *
   * @param index Widget index
   */
  collapse(index) {
    const widget = this.layout.widgets[index];
    if (widget && !widget.isHidden) {
      this._toggleExpansion(index);
    }
  }
  /**
   * Expand the widget at position `index`.
   *
   * #### Notes
   * If no widget is found for `index`, this will bail.
   *
   * @param index Widget index
   */
  expand(index) {
    const widget = this.layout.widgets[index];
    if (widget && widget.isHidden) {
      this._toggleExpansion(index);
    }
  }
  /**
   * Insert a widget at the specified index.
   *
   * @param index - The index at which to insert the widget.
   *
   * @param widget - The widget to insert into to the panel.
   *
   * #### Notes
   * If the widget is already contained in the panel, it will be moved.
   */
  insertWidget(index, widget) {
    super.insertWidget(index, widget);
    widget.title.changed.connect(this._onTitleChanged, this);
  }
  /**
   * Handle the DOM events for the accordion panel.
   *
   * @param event - The DOM event sent to the panel.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the panel's DOM node. It should
   * not be called directly by user code.
   */
  handleEvent(event) {
    super.handleEvent(event);
    switch (event.type) {
      case "click":
        this._evtClick(event);
        break;
      case "keydown":
        this._eventKeyDown(event);
        break;
    }
  }
  /**
   * A message handler invoked on a `'before-attach'` message.
   */
  onBeforeAttach(msg) {
    this.node.addEventListener("click", this);
    this.node.addEventListener("keydown", this);
    super.onBeforeAttach(msg);
  }
  /**
   * A message handler invoked on an `'after-detach'` message.
   */
  onAfterDetach(msg) {
    super.onAfterDetach(msg);
    this.node.removeEventListener("click", this);
    this.node.removeEventListener("keydown", this);
  }
  /**
   * Handle the `changed` signal of a title object.
   */
  _onTitleChanged(sender) {
    const index = import_algorithm2.ArrayExt.findFirstIndex(this.widgets, (widget) => {
      return widget.contains(sender.owner);
    });
    if (index >= 0) {
      this.layout.updateTitle(index, sender.owner);
      this.update();
    }
  }
  /**
   * Compute the size of widgets in this panel on the title click event.
   * On closing, the size of the widget is cached and we will try to expand
   * the last opened widget.
   * On opening, we will use the cached size if it is available to restore the
   * widget.
   * In both cases, if we can not compute the size of widgets, we will let
   * `SplitLayout` decide.
   *
   * @param index - The index of widget to be opened of closed
   *
   * @returns Relative size of widgets in this panel, if this size can
   * not be computed, return `undefined`
   */
  _computeWidgetSize(index) {
    const layout = this.layout;
    const widget = layout.widgets[index];
    if (!widget) {
      return void 0;
    }
    const isHidden = widget.isHidden;
    const widgetSizes = layout.absoluteSizes();
    const delta = (isHidden ? -1 : 1) * this.spacing;
    const totalSize = widgetSizes.reduce((prev, curr) => prev + curr);
    let newSize = [...widgetSizes];
    if (!isHidden) {
      const currentSize = widgetSizes[index];
      this._widgetSizesCache.set(widget, currentSize);
      newSize[index] = 0;
      const widgetToCollapse = newSize.map((sz) => sz > 0).lastIndexOf(true);
      if (widgetToCollapse === -1) {
        return void 0;
      }
      newSize[widgetToCollapse] = widgetSizes[widgetToCollapse] + currentSize + delta;
    } else {
      const previousSize = this._widgetSizesCache.get(widget);
      if (!previousSize) {
        return void 0;
      }
      newSize[index] += previousSize;
      const widgetToCollapse = newSize.map((sz) => sz - previousSize > 0).lastIndexOf(true);
      if (widgetToCollapse === -1) {
        newSize.forEach((_, idx) => {
          if (idx !== index) {
            newSize[idx] -= widgetSizes[idx] / totalSize * (previousSize - delta);
          }
        });
      } else {
        newSize[widgetToCollapse] -= previousSize - delta;
      }
    }
    return newSize.map((sz) => sz / (totalSize + delta));
  }
  /**
   * Handle the `'click'` event for the accordion panel
   */
  _evtClick(event) {
    const target = event.target;
    if (target) {
      const index = import_algorithm2.ArrayExt.findFirstIndex(this.titles, (title) => {
        return title.contains(target);
      });
      if (index >= 0) {
        event.preventDefault();
        event.stopPropagation();
        this._toggleExpansion(index);
      }
    }
  }
  /**
   * Handle the `'keydown'` event for the accordion panel.
   */
  _eventKeyDown(event) {
    if (event.defaultPrevented) {
      return;
    }
    const target = event.target;
    let handled = false;
    if (target) {
      const index = import_algorithm2.ArrayExt.findFirstIndex(this.titles, (title) => {
        return title.contains(target);
      });
      if (index >= 0) {
        const keyCode = event.keyCode.toString();
        if (event.key.match(/Space|Enter/) || keyCode.match(/13|32/)) {
          target.click();
          handled = true;
        } else if (this.orientation === "horizontal" ? event.key.match(/ArrowLeft|ArrowRight/) || keyCode.match(/37|39/) : event.key.match(/ArrowUp|ArrowDown/) || keyCode.match(/38|40/)) {
          const direction = event.key.match(/ArrowLeft|ArrowUp/) || keyCode.match(/37|38/) ? -1 : 1;
          const length = this.titles.length;
          const newIndex = (index + length + direction) % length;
          this.titles[newIndex].focus();
          handled = true;
        } else if (event.key === "End" || keyCode === "35") {
          this.titles[this.titles.length - 1].focus();
          handled = true;
        } else if (event.key === "Home" || keyCode === "36") {
          this.titles[0].focus();
          handled = true;
        }
      }
      if (handled) {
        event.preventDefault();
      }
    }
  }
  _toggleExpansion(index) {
    const title = this.titles[index];
    const widget = this.layout.widgets[index];
    const newSize = this._computeWidgetSize(index);
    if (newSize) {
      this.setRelativeSizes(newSize, false);
    }
    if (widget.isHidden) {
      title.classList.add("lm-mod-expanded");
      title.setAttribute("aria-expanded", "true");
      widget.show();
    } else {
      title.classList.remove("lm-mod-expanded");
      title.setAttribute("aria-expanded", "false");
      widget.hide();
    }
    this._expansionToggled.emit(index);
  }
};
(function(AccordionPanel2) {
  class Renderer extends SplitPanel.Renderer {
    constructor() {
      super();
      this.titleClassName = "lm-AccordionPanel-title";
      this._titleID = 0;
      this._titleKeys = /* @__PURE__ */ new WeakMap();
      this._uuid = ++Renderer._nInstance;
    }
    /**
     * Render the collapse indicator for a section title.
     *
     * @param data - The data to use for rendering the section title.
     *
     * @returns A element representing the collapse indicator.
     */
    createCollapseIcon(data) {
      return document.createElement("span");
    }
    /**
     * Render the element for a section title.
     *
     * @param data - The data to use for rendering the section title.
     *
     * @returns A element representing the section title.
     */
    createSectionTitle(data) {
      const handle = document.createElement("h3");
      handle.setAttribute("tabindex", "0");
      handle.id = this.createTitleKey(data);
      handle.className = this.titleClassName;
      for (const aData in data.dataset) {
        handle.dataset[aData] = data.dataset[aData];
      }
      const collapser = handle.appendChild(this.createCollapseIcon(data));
      collapser.className = "lm-AccordionPanel-titleCollapser";
      const label = handle.appendChild(document.createElement("span"));
      label.className = "lm-AccordionPanel-titleLabel";
      label.textContent = data.label;
      label.title = data.caption || data.label;
      return handle;
    }
    /**
     * Create a unique render key for the title.
     *
     * @param data - The data to use for the title.
     *
     * @returns The unique render key for the title.
     *
     * #### Notes
     * This method caches the key against the section title the first time
     * the key is generated.
     */
    createTitleKey(data) {
      let key = this._titleKeys.get(data);
      if (key === void 0) {
        key = `title-key-${this._uuid}-${this._titleID++}`;
        this._titleKeys.set(data, key);
      }
      return key;
    }
  }
  Renderer._nInstance = 0;
  AccordionPanel2.Renderer = Renderer;
  AccordionPanel2.defaultRenderer = new Renderer();
})(AccordionPanel || (AccordionPanel = {}));
var Private$d;
(function(Private6) {
  function createLayout(options) {
    return options.layout || new AccordionLayout({
      renderer: options.renderer || AccordionPanel.defaultRenderer,
      orientation: options.orientation,
      alignment: options.alignment,
      spacing: options.spacing,
      titleSpace: options.titleSpace
    });
  }
  Private6.createLayout = createLayout;
})(Private$d || (Private$d = {}));
var BoxLayout = class _BoxLayout extends PanelLayout {
  /**
   * Construct a new box layout.
   *
   * @param options - The options for initializing the layout.
   */
  constructor(options = {}) {
    super();
    this._fixed = 0;
    this._spacing = 4;
    this._dirty = false;
    this._sizers = [];
    this._items = [];
    this._box = null;
    this._alignment = "start";
    this._direction = "top-to-bottom";
    if (options.direction !== void 0) {
      this._direction = options.direction;
    }
    if (options.alignment !== void 0) {
      this._alignment = options.alignment;
    }
    if (options.spacing !== void 0) {
      this._spacing = Utils$1.clampDimension(options.spacing);
    }
  }
  /**
   * Dispose of the resources held by the layout.
   */
  dispose() {
    for (const item of this._items) {
      item.dispose();
    }
    this._box = null;
    this._items.length = 0;
    this._sizers.length = 0;
    super.dispose();
  }
  /**
   * Get the layout direction for the box layout.
   */
  get direction() {
    return this._direction;
  }
  /**
   * Set the layout direction for the box layout.
   */
  set direction(value) {
    if (this._direction === value) {
      return;
    }
    this._direction = value;
    if (!this.parent) {
      return;
    }
    this.parent.dataset["direction"] = value;
    this.parent.fit();
  }
  /**
   * Get the content alignment for the box layout.
   *
   * #### Notes
   * This is the alignment of the widgets in the layout direction.
   *
   * The alignment has no effect if the widgets can expand to fill the
   * entire box layout.
   */
  get alignment() {
    return this._alignment;
  }
  /**
   * Set the content alignment for the box layout.
   *
   * #### Notes
   * This is the alignment of the widgets in the layout direction.
   *
   * The alignment has no effect if the widgets can expand to fill the
   * entire box layout.
   */
  set alignment(value) {
    if (this._alignment === value) {
      return;
    }
    this._alignment = value;
    if (!this.parent) {
      return;
    }
    this.parent.dataset["alignment"] = value;
    this.parent.update();
  }
  /**
   * Get the inter-element spacing for the box layout.
   */
  get spacing() {
    return this._spacing;
  }
  /**
   * Set the inter-element spacing for the box layout.
   */
  set spacing(value) {
    value = Utils$1.clampDimension(value);
    if (this._spacing === value) {
      return;
    }
    this._spacing = value;
    if (!this.parent) {
      return;
    }
    this.parent.fit();
  }
  /**
   * Perform layout initialization which requires the parent widget.
   */
  init() {
    this.parent.dataset["direction"] = this.direction;
    this.parent.dataset["alignment"] = this.alignment;
    super.init();
  }
  /**
   * Attach a widget to the parent's DOM node.
   *
   * @param index - The current index of the widget in the layout.
   *
   * @param widget - The widget to attach to the parent.
   *
   * #### Notes
   * This is a reimplementation of the superclass method.
   */
  attachWidget(index, widget) {
    import_algorithm2.ArrayExt.insert(this._items, index, new LayoutItem(widget));
    import_algorithm2.ArrayExt.insert(this._sizers, index, new BoxSizer());
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.BeforeAttach);
    }
    this.parent.node.appendChild(widget.node);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.AfterAttach);
    }
    this.parent.fit();
  }
  /**
   * Move a widget in the parent's DOM node.
   *
   * @param fromIndex - The previous index of the widget in the layout.
   *
   * @param toIndex - The current index of the widget in the layout.
   *
   * @param widget - The widget to move in the parent.
   *
   * #### Notes
   * This is a reimplementation of the superclass method.
   */
  moveWidget(fromIndex, toIndex, widget) {
    import_algorithm2.ArrayExt.move(this._items, fromIndex, toIndex);
    import_algorithm2.ArrayExt.move(this._sizers, fromIndex, toIndex);
    this.parent.update();
  }
  /**
   * Detach a widget from the parent's DOM node.
   *
   * @param index - The previous index of the widget in the layout.
   *
   * @param widget - The widget to detach from the parent.
   *
   * #### Notes
   * This is a reimplementation of the superclass method.
   */
  detachWidget(index, widget) {
    let item = import_algorithm2.ArrayExt.removeAt(this._items, index);
    import_algorithm2.ArrayExt.removeAt(this._sizers, index);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.BeforeDetach);
    }
    this.parent.node.removeChild(widget.node);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.AfterDetach);
    }
    item.dispose();
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'before-show'` message.
   */
  onBeforeShow(msg) {
    super.onBeforeShow(msg);
    this.parent.update();
  }
  /**
   * A message handler invoked on a `'before-attach'` message.
   */
  onBeforeAttach(msg) {
    super.onBeforeAttach(msg);
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'child-shown'` message.
   */
  onChildShown(msg) {
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'child-hidden'` message.
   */
  onChildHidden(msg) {
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'resize'` message.
   */
  onResize(msg) {
    if (this.parent.isVisible) {
      this._update(msg.width, msg.height);
    }
  }
  /**
   * A message handler invoked on an `'update-request'` message.
   */
  onUpdateRequest(msg) {
    if (this.parent.isVisible) {
      this._update(-1, -1);
    }
  }
  /**
   * A message handler invoked on a `'fit-request'` message.
   */
  onFitRequest(msg) {
    if (this.parent.isAttached) {
      this._fit();
    }
  }
  /**
   * Fit the layout to the total size required by the widgets.
   */
  _fit() {
    let nVisible = 0;
    for (let i = 0, n = this._items.length; i < n; ++i) {
      nVisible += +!this._items[i].isHidden;
    }
    this._fixed = this._spacing * Math.max(0, nVisible - 1);
    let horz = Private$c.isHorizontal(this._direction);
    let minW = horz ? this._fixed : 0;
    let minH = horz ? 0 : this._fixed;
    for (let i = 0, n = this._items.length; i < n; ++i) {
      let item = this._items[i];
      let sizer = this._sizers[i];
      if (item.isHidden) {
        sizer.minSize = 0;
        sizer.maxSize = 0;
        continue;
      }
      item.fit();
      sizer.sizeHint = _BoxLayout.getSizeBasis(item.widget);
      sizer.stretch = _BoxLayout.getStretch(item.widget);
      if (horz) {
        sizer.minSize = item.minWidth;
        sizer.maxSize = item.maxWidth;
        minW += item.minWidth;
        minH = Math.max(minH, item.minHeight);
      } else {
        sizer.minSize = item.minHeight;
        sizer.maxSize = item.maxHeight;
        minH += item.minHeight;
        minW = Math.max(minW, item.minWidth);
      }
    }
    let box = this._box = import_domutils2.ElementExt.boxSizing(this.parent.node);
    minW += box.horizontalSum;
    minH += box.verticalSum;
    let style = this.parent.node.style;
    style.minWidth = `${minW}px`;
    style.minHeight = `${minH}px`;
    this._dirty = true;
    if (this.parent.parent) {
      import_messaging.MessageLoop.sendMessage(this.parent.parent, Widget.Msg.FitRequest);
    }
    if (this._dirty) {
      import_messaging.MessageLoop.sendMessage(this.parent, Widget.Msg.UpdateRequest);
    }
  }
  /**
   * Update the layout position and size of the widgets.
   *
   * The parent offset dimensions should be `-1` if unknown.
   */
  _update(offsetWidth, offsetHeight) {
    this._dirty = false;
    let nVisible = 0;
    for (let i = 0, n = this._items.length; i < n; ++i) {
      nVisible += +!this._items[i].isHidden;
    }
    if (nVisible === 0) {
      return;
    }
    if (offsetWidth < 0) {
      offsetWidth = this.parent.node.offsetWidth;
    }
    if (offsetHeight < 0) {
      offsetHeight = this.parent.node.offsetHeight;
    }
    if (!this._box) {
      this._box = import_domutils2.ElementExt.boxSizing(this.parent.node);
    }
    let top = this._box.paddingTop;
    let left = this._box.paddingLeft;
    let width = offsetWidth - this._box.horizontalSum;
    let height = offsetHeight - this._box.verticalSum;
    let delta;
    switch (this._direction) {
      case "left-to-right":
        delta = BoxEngine.calc(this._sizers, Math.max(0, width - this._fixed));
        break;
      case "top-to-bottom":
        delta = BoxEngine.calc(this._sizers, Math.max(0, height - this._fixed));
        break;
      case "right-to-left":
        delta = BoxEngine.calc(this._sizers, Math.max(0, width - this._fixed));
        left += width;
        break;
      case "bottom-to-top":
        delta = BoxEngine.calc(this._sizers, Math.max(0, height - this._fixed));
        top += height;
        break;
      default:
        throw "unreachable";
    }
    let extra = 0;
    let offset = 0;
    if (delta > 0) {
      switch (this._alignment) {
        case "start":
          break;
        case "center":
          extra = 0;
          offset = delta / 2;
          break;
        case "end":
          extra = 0;
          offset = delta;
          break;
        case "justify":
          extra = delta / nVisible;
          offset = 0;
          break;
        default:
          throw "unreachable";
      }
    }
    for (let i = 0, n = this._items.length; i < n; ++i) {
      let item = this._items[i];
      if (item.isHidden) {
        continue;
      }
      let size = this._sizers[i].size;
      switch (this._direction) {
        case "left-to-right":
          item.update(left + offset, top, size + extra, height);
          left += size + extra + this._spacing;
          break;
        case "top-to-bottom":
          item.update(left, top + offset, width, size + extra);
          top += size + extra + this._spacing;
          break;
        case "right-to-left":
          item.update(left - offset - size - extra, top, size + extra, height);
          left -= size + extra + this._spacing;
          break;
        case "bottom-to-top":
          item.update(left, top - offset - size - extra, width, size + extra);
          top -= size + extra + this._spacing;
          break;
        default:
          throw "unreachable";
      }
    }
  }
};
(function(BoxLayout2) {
  function getStretch(widget) {
    return Private$c.stretchProperty.get(widget);
  }
  BoxLayout2.getStretch = getStretch;
  function setStretch(widget, value) {
    Private$c.stretchProperty.set(widget, value);
  }
  BoxLayout2.setStretch = setStretch;
  function getSizeBasis(widget) {
    return Private$c.sizeBasisProperty.get(widget);
  }
  BoxLayout2.getSizeBasis = getSizeBasis;
  function setSizeBasis(widget, value) {
    Private$c.sizeBasisProperty.set(widget, value);
  }
  BoxLayout2.setSizeBasis = setSizeBasis;
})(BoxLayout || (BoxLayout = {}));
var Private$c;
(function(Private6) {
  Private6.stretchProperty = new import_properties.AttachedProperty({
    name: "stretch",
    create: () => 0,
    coerce: (owner, value) => Math.max(0, Math.floor(value)),
    changed: onChildSizingChanged
  });
  Private6.sizeBasisProperty = new import_properties.AttachedProperty({
    name: "sizeBasis",
    create: () => 0,
    coerce: (owner, value) => Math.max(0, Math.floor(value)),
    changed: onChildSizingChanged
  });
  function isHorizontal(dir) {
    return dir === "left-to-right" || dir === "right-to-left";
  }
  Private6.isHorizontal = isHorizontal;
  function clampSpacing(value) {
    return Math.max(0, Math.floor(value));
  }
  Private6.clampSpacing = clampSpacing;
  function onChildSizingChanged(child) {
    if (child.parent && child.parent.layout instanceof BoxLayout) {
      child.parent.fit();
    }
  }
})(Private$c || (Private$c = {}));
var BoxPanel = class extends Panel {
  /**
   * Construct a new box panel.
   *
   * @param options - The options for initializing the box panel.
   */
  constructor(options = {}) {
    super({ layout: Private$b.createLayout(options) });
    this.addClass("lm-BoxPanel");
  }
  /**
   * Get the layout direction for the box panel.
   */
  get direction() {
    return this.layout.direction;
  }
  /**
   * Set the layout direction for the box panel.
   */
  set direction(value) {
    this.layout.direction = value;
  }
  /**
   * Get the content alignment for the box panel.
   *
   * #### Notes
   * This is the alignment of the widgets in the layout direction.
   *
   * The alignment has no effect if the widgets can expand to fill the
   * entire box layout.
   */
  get alignment() {
    return this.layout.alignment;
  }
  /**
   * Set the content alignment for the box panel.
   *
   * #### Notes
   * This is the alignment of the widgets in the layout direction.
   *
   * The alignment has no effect if the widgets can expand to fill the
   * entire box layout.
   */
  set alignment(value) {
    this.layout.alignment = value;
  }
  /**
   * Get the inter-element spacing for the box panel.
   */
  get spacing() {
    return this.layout.spacing;
  }
  /**
   * Set the inter-element spacing for the box panel.
   */
  set spacing(value) {
    this.layout.spacing = value;
  }
  /**
   * A message handler invoked on a `'child-added'` message.
   */
  onChildAdded(msg) {
    msg.child.addClass("lm-BoxPanel-child");
  }
  /**
   * A message handler invoked on a `'child-removed'` message.
   */
  onChildRemoved(msg) {
    msg.child.removeClass("lm-BoxPanel-child");
  }
};
(function(BoxPanel2) {
  function getStretch(widget) {
    return BoxLayout.getStretch(widget);
  }
  BoxPanel2.getStretch = getStretch;
  function setStretch(widget, value) {
    BoxLayout.setStretch(widget, value);
  }
  BoxPanel2.setStretch = setStretch;
  function getSizeBasis(widget) {
    return BoxLayout.getSizeBasis(widget);
  }
  BoxPanel2.getSizeBasis = getSizeBasis;
  function setSizeBasis(widget, value) {
    BoxLayout.setSizeBasis(widget, value);
  }
  BoxPanel2.setSizeBasis = setSizeBasis;
})(BoxPanel || (BoxPanel = {}));
var Private$b;
(function(Private6) {
  function createLayout(options) {
    return options.layout || new BoxLayout(options);
  }
  Private6.createLayout = createLayout;
})(Private$b || (Private$b = {}));
var CommandPalette = class _CommandPalette extends Widget {
  /**
   * Construct a new command palette.
   *
   * @param options - The options for initializing the palette.
   */
  constructor(options) {
    super({ node: Private$a.createNode() });
    this._activeIndex = -1;
    this._items = [];
    this._results = null;
    this.addClass("lm-CommandPalette");
    this.setFlag(Widget.Flag.DisallowLayout);
    this.commands = options.commands;
    this.renderer = options.renderer || _CommandPalette.defaultRenderer;
    this.commands.commandChanged.connect(this._onGenericChange, this);
    this.commands.keyBindingChanged.connect(this._onGenericChange, this);
  }
  /**
   * Dispose of the resources held by the widget.
   */
  dispose() {
    this._items.length = 0;
    this._results = null;
    super.dispose();
  }
  /**
   * The command palette search node.
   *
   * #### Notes
   * This is the node which contains the search-related elements.
   */
  get searchNode() {
    return this.node.getElementsByClassName("lm-CommandPalette-search")[0];
  }
  /**
   * The command palette input node.
   *
   * #### Notes
   * This is the actual input node for the search area.
   */
  get inputNode() {
    return this.node.getElementsByClassName("lm-CommandPalette-input")[0];
  }
  /**
   * The command palette content node.
   *
   * #### Notes
   * This is the node which holds the command item nodes.
   *
   * Modifying this node directly can lead to undefined behavior.
   */
  get contentNode() {
    return this.node.getElementsByClassName("lm-CommandPalette-content")[0];
  }
  /**
   * A read-only array of the command items in the palette.
   */
  get items() {
    return this._items;
  }
  /**
   * Add a command item to the command palette.
   *
   * @param options - The options for creating the command item.
   *
   * @returns The command item added to the palette.
   */
  addItem(options) {
    let item = Private$a.createItem(this.commands, options);
    this._items.push(item);
    this.refresh();
    return item;
  }
  /**
   * Adds command items to the command palette.
   *
   * @param items - An array of options for creating each command item.
   *
   * @returns The command items added to the palette.
   */
  addItems(items) {
    const newItems = items.map((item) => Private$a.createItem(this.commands, item));
    newItems.forEach((item) => this._items.push(item));
    this.refresh();
    return newItems;
  }
  /**
   * Remove an item from the command palette.
   *
   * @param item - The item to remove from the palette.
   *
   * #### Notes
   * This is a no-op if the item is not in the palette.
   */
  removeItem(item) {
    this.removeItemAt(this._items.indexOf(item));
  }
  /**
   * Remove the item at a given index from the command palette.
   *
   * @param index - The index of the item to remove.
   *
   * #### Notes
   * This is a no-op if the index is out of range.
   */
  removeItemAt(index) {
    let item = import_algorithm2.ArrayExt.removeAt(this._items, index);
    if (!item) {
      return;
    }
    this.refresh();
  }
  /**
   * Remove all items from the command palette.
   */
  clearItems() {
    if (this._items.length === 0) {
      return;
    }
    this._items.length = 0;
    this.refresh();
  }
  /**
   * Clear the search results and schedule an update.
   *
   * #### Notes
   * This should be called whenever the search results of the palette
   * should be updated.
   *
   * This is typically called automatically by the palette as needed,
   * but can be called manually if the input text is programatically
   * changed.
   *
   * The rendered results are updated asynchronously.
   */
  refresh() {
    this._results = null;
    if (this.inputNode.value !== "") {
      let clear = this.node.getElementsByClassName("lm-close-icon")[0];
      clear.style.display = "inherit";
    } else {
      let clear = this.node.getElementsByClassName("lm-close-icon")[0];
      clear.style.display = "none";
    }
    this.update();
  }
  /**
   * Handle the DOM events for the command palette.
   *
   * @param event - The DOM event sent to the command palette.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the command palette's DOM node.
   * It should not be called directly by user code.
   */
  handleEvent(event) {
    switch (event.type) {
      case "click":
        this._evtClick(event);
        break;
      case "keydown":
        this._evtKeyDown(event);
        break;
      case "input":
        this.refresh();
        break;
      case "focus":
      case "blur":
        this._toggleFocused();
        break;
    }
  }
  /**
   * A message handler invoked on a `'before-attach'` message.
   */
  onBeforeAttach(msg) {
    this.node.addEventListener("click", this);
    this.node.addEventListener("keydown", this);
    this.node.addEventListener("input", this);
    this.node.addEventListener("focus", this, true);
    this.node.addEventListener("blur", this, true);
  }
  /**
   * A message handler invoked on an `'after-detach'` message.
   */
  onAfterDetach(msg) {
    this.node.removeEventListener("click", this);
    this.node.removeEventListener("keydown", this);
    this.node.removeEventListener("input", this);
    this.node.removeEventListener("focus", this, true);
    this.node.removeEventListener("blur", this, true);
  }
  /**
   * A message handler invoked on an `'after-show'` message.
   */
  onAfterShow(msg) {
    this.update();
    super.onAfterShow(msg);
  }
  /**
   * A message handler invoked on an `'activate-request'` message.
   */
  onActivateRequest(msg) {
    if (this.isAttached) {
      let input = this.inputNode;
      input.focus();
      input.select();
    }
  }
  /**
   * A message handler invoked on an `'update-request'` message.
   */
  onUpdateRequest(msg) {
    if (!this.isVisible) {
      import_virtualdom.VirtualDOM.render(null, this.contentNode);
      return;
    }
    let query = this.inputNode.value;
    let contentNode = this.contentNode;
    let results = this._results;
    if (!results) {
      results = this._results = Private$a.search(this._items, query);
      this._activeIndex = query ? import_algorithm2.ArrayExt.findFirstIndex(results, Private$a.canActivate) : -1;
    }
    if (!query && results.length === 0) {
      import_virtualdom.VirtualDOM.render(null, contentNode);
      return;
    }
    if (query && results.length === 0) {
      let content2 = this.renderer.renderEmptyMessage({ query });
      import_virtualdom.VirtualDOM.render(content2, contentNode);
      return;
    }
    let renderer = this.renderer;
    let activeIndex = this._activeIndex;
    let content = new Array(results.length);
    for (let i = 0, n = results.length; i < n; ++i) {
      let result = results[i];
      if (result.type === "header") {
        let indices = result.indices;
        let category = result.category;
        content[i] = renderer.renderHeader({ category, indices });
      } else {
        let item = result.item;
        let indices = result.indices;
        let active = i === activeIndex;
        content[i] = renderer.renderItem({ item, indices, active });
      }
    }
    import_virtualdom.VirtualDOM.render(content, contentNode);
    if (activeIndex < 0 || activeIndex >= results.length) {
      contentNode.scrollTop = 0;
    } else {
      let element = contentNode.children[activeIndex];
      import_domutils2.ElementExt.scrollIntoViewIfNeeded(contentNode, element);
    }
  }
  /**
   * Handle the `'click'` event for the command palette.
   */
  _evtClick(event) {
    if (event.button !== 0) {
      return;
    }
    if (event.target.classList.contains("lm-close-icon")) {
      this.inputNode.value = "";
      this.refresh();
      return;
    }
    let index = import_algorithm2.ArrayExt.findFirstIndex(this.contentNode.children, (node) => {
      return node.contains(event.target);
    });
    if (index === -1) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this._execute(index);
  }
  /**
   * Handle the `'keydown'` event for the command palette.
   */
  _evtKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    switch (event.keyCode) {
      case 13:
        event.preventDefault();
        event.stopPropagation();
        this._execute(this._activeIndex);
        break;
      case 38:
        event.preventDefault();
        event.stopPropagation();
        this._activatePreviousItem();
        break;
      case 40:
        event.preventDefault();
        event.stopPropagation();
        this._activateNextItem();
        break;
    }
  }
  /**
   * Activate the next enabled command item.
   */
  _activateNextItem() {
    if (!this._results || this._results.length === 0) {
      return;
    }
    let ai = this._activeIndex;
    let n = this._results.length;
    let start = ai < n - 1 ? ai + 1 : 0;
    let stop = start === 0 ? n - 1 : start - 1;
    this._activeIndex = import_algorithm2.ArrayExt.findFirstIndex(this._results, Private$a.canActivate, start, stop);
    this.update();
  }
  /**
   * Activate the previous enabled command item.
   */
  _activatePreviousItem() {
    if (!this._results || this._results.length === 0) {
      return;
    }
    let ai = this._activeIndex;
    let n = this._results.length;
    let start = ai <= 0 ? n - 1 : ai - 1;
    let stop = start === n - 1 ? 0 : start + 1;
    this._activeIndex = import_algorithm2.ArrayExt.findLastIndex(this._results, Private$a.canActivate, start, stop);
    this.update();
  }
  /**
   * Execute the command item at the given index, if possible.
   */
  _execute(index) {
    if (!this._results) {
      return;
    }
    let part = this._results[index];
    if (!part) {
      return;
    }
    if (part.type === "header") {
      let input = this.inputNode;
      input.value = `${part.category.toLowerCase()} `;
      input.focus();
      this.refresh();
      return;
    }
    if (!part.item.isEnabled) {
      return;
    }
    this.commands.execute(part.item.command, part.item.args);
    this.inputNode.value = "";
    this.refresh();
  }
  /**
   * Toggle the focused modifier based on the input node focus state.
   */
  _toggleFocused() {
    let focused = document.activeElement === this.inputNode;
    this.toggleClass("lm-mod-focused", focused);
  }
  /**
   * A signal handler for generic command changes.
   */
  _onGenericChange() {
    this.refresh();
  }
};
(function(CommandPalette2) {
  class Renderer {
    /**
     * Render the virtual element for a command palette header.
     *
     * @param data - The data to use for rendering the header.
     *
     * @returns A virtual element representing the header.
     */
    renderHeader(data) {
      let content = this.formatHeader(data);
      return import_virtualdom.h.li({ className: "lm-CommandPalette-header" }, content);
    }
    /**
     * Render the virtual element for a command palette item.
     *
     * @param data - The data to use for rendering the item.
     *
     * @returns A virtual element representing the item.
     */
    renderItem(data) {
      let className = this.createItemClass(data);
      let dataset = this.createItemDataset(data);
      if (data.item.isToggleable) {
        return import_virtualdom.h.li({
          className,
          dataset,
          role: "menuitemcheckbox",
          "aria-checked": `${data.item.isToggled}`
        }, this.renderItemIcon(data), this.renderItemContent(data), this.renderItemShortcut(data));
      }
      return import_virtualdom.h.li({
        className,
        dataset,
        role: "menuitem"
      }, this.renderItemIcon(data), this.renderItemContent(data), this.renderItemShortcut(data));
    }
    /**
     * Render the empty results message for a command palette.
     *
     * @param data - The data to use for rendering the message.
     *
     * @returns A virtual element representing the message.
     */
    renderEmptyMessage(data) {
      let content = this.formatEmptyMessage(data);
      return import_virtualdom.h.li({ className: "lm-CommandPalette-emptyMessage" }, content);
    }
    /**
     * Render the icon for a command palette item.
     *
     * @param data - The data to use for rendering the icon.
     *
     * @returns A virtual element representing the icon.
     */
    renderItemIcon(data) {
      let className = this.createIconClass(data);
      return import_virtualdom.h.div({ className }, data.item.icon, data.item.iconLabel);
    }
    /**
     * Render the content for a command palette item.
     *
     * @param data - The data to use for rendering the content.
     *
     * @returns A virtual element representing the content.
     */
    renderItemContent(data) {
      return import_virtualdom.h.div({ className: "lm-CommandPalette-itemContent" }, this.renderItemLabel(data), this.renderItemCaption(data));
    }
    /**
     * Render the label for a command palette item.
     *
     * @param data - The data to use for rendering the label.
     *
     * @returns A virtual element representing the label.
     */
    renderItemLabel(data) {
      let content = this.formatItemLabel(data);
      return import_virtualdom.h.div({ className: "lm-CommandPalette-itemLabel" }, content);
    }
    /**
     * Render the caption for a command palette item.
     *
     * @param data - The data to use for rendering the caption.
     *
     * @returns A virtual element representing the caption.
     */
    renderItemCaption(data) {
      let content = this.formatItemCaption(data);
      return import_virtualdom.h.div({ className: "lm-CommandPalette-itemCaption" }, content);
    }
    /**
     * Render the shortcut for a command palette item.
     *
     * @param data - The data to use for rendering the shortcut.
     *
     * @returns A virtual element representing the shortcut.
     */
    renderItemShortcut(data) {
      let content = this.formatItemShortcut(data);
      return import_virtualdom.h.div({ className: "lm-CommandPalette-itemShortcut" }, content);
    }
    /**
     * Create the class name for the command palette item.
     *
     * @param data - The data to use for the class name.
     *
     * @returns The full class name for the command palette item.
     */
    createItemClass(data) {
      let name = "lm-CommandPalette-item";
      if (!data.item.isEnabled) {
        name += " lm-mod-disabled";
      }
      if (data.item.isToggled) {
        name += " lm-mod-toggled";
      }
      if (data.active) {
        name += " lm-mod-active";
      }
      let extra = data.item.className;
      if (extra) {
        name += ` ${extra}`;
      }
      return name;
    }
    /**
     * Create the dataset for the command palette item.
     *
     * @param data - The data to use for creating the dataset.
     *
     * @returns The dataset for the command palette item.
     */
    createItemDataset(data) {
      return { ...data.item.dataset, command: data.item.command };
    }
    /**
     * Create the class name for the command item icon.
     *
     * @param data - The data to use for the class name.
     *
     * @returns The full class name for the item icon.
     */
    createIconClass(data) {
      let name = "lm-CommandPalette-itemIcon";
      let extra = data.item.iconClass;
      return extra ? `${name} ${extra}` : name;
    }
    /**
     * Create the render content for the header node.
     *
     * @param data - The data to use for the header content.
     *
     * @returns The content to add to the header node.
     */
    formatHeader(data) {
      if (!data.indices || data.indices.length === 0) {
        return data.category;
      }
      return import_algorithm2.StringExt.highlight(data.category, data.indices, import_virtualdom.h.mark);
    }
    /**
     * Create the render content for the empty message node.
     *
     * @param data - The data to use for the empty message content.
     *
     * @returns The content to add to the empty message node.
     */
    formatEmptyMessage(data) {
      return `No commands found that match '${data.query}'`;
    }
    /**
     * Create the render content for the item shortcut node.
     *
     * @param data - The data to use for the shortcut content.
     *
     * @returns The content to add to the shortcut node.
     */
    formatItemShortcut(data) {
      let kb = data.item.keyBinding;
      return kb ? CommandRegistry.formatKeystroke(kb.keys) : null;
    }
    /**
     * Create the render content for the item label node.
     *
     * @param data - The data to use for the label content.
     *
     * @returns The content to add to the label node.
     */
    formatItemLabel(data) {
      if (!data.indices || data.indices.length === 0) {
        return data.item.label;
      }
      return import_algorithm2.StringExt.highlight(data.item.label, data.indices, import_virtualdom.h.mark);
    }
    /**
     * Create the render content for the item caption node.
     *
     * @param data - The data to use for the caption content.
     *
     * @returns The content to add to the caption node.
     */
    formatItemCaption(data) {
      return data.item.caption;
    }
  }
  CommandPalette2.Renderer = Renderer;
  CommandPalette2.defaultRenderer = new Renderer();
})(CommandPalette || (CommandPalette = {}));
var Private$a;
(function(Private6) {
  function createNode() {
    let node = document.createElement("div");
    let search2 = document.createElement("div");
    let wrapper = document.createElement("div");
    let input = document.createElement("input");
    let content = document.createElement("ul");
    let clear = document.createElement("button");
    search2.className = "lm-CommandPalette-search";
    wrapper.className = "lm-CommandPalette-wrapper";
    input.className = "lm-CommandPalette-input";
    clear.className = "lm-close-icon";
    content.className = "lm-CommandPalette-content";
    content.setAttribute("role", "menu");
    input.spellcheck = false;
    wrapper.appendChild(input);
    wrapper.appendChild(clear);
    search2.appendChild(wrapper);
    node.appendChild(search2);
    node.appendChild(content);
    return node;
  }
  Private6.createNode = createNode;
  function createItem(commands, options) {
    return new CommandItem(commands, options);
  }
  Private6.createItem = createItem;
  function search(items, query) {
    let scores = matchItems(items, query);
    scores.sort(scoreCmp);
    return createResults(scores);
  }
  Private6.search = search;
  function canActivate(result) {
    return result.type === "item" && result.item.isEnabled;
  }
  Private6.canActivate = canActivate;
  function normalizeCategory(category) {
    return category.trim().replace(/\s+/g, " ");
  }
  function normalizeQuery(text) {
    return text.replace(/\s+/g, "").toLowerCase();
  }
  function matchItems(items, query) {
    query = normalizeQuery(query);
    let scores = [];
    for (let i = 0, n = items.length; i < n; ++i) {
      let item = items[i];
      if (!item.isVisible) {
        continue;
      }
      if (!query) {
        scores.push({
          matchType: 3,
          categoryIndices: null,
          labelIndices: null,
          score: 0,
          item
        });
        continue;
      }
      let score = fuzzySearch(item, query);
      if (!score) {
        continue;
      }
      if (!item.isEnabled) {
        score.score += 1e3;
      }
      scores.push(score);
    }
    return scores;
  }
  function fuzzySearch(item, query) {
    let category = item.category.toLowerCase();
    let label = item.label.toLowerCase();
    let source = `${category} ${label}`;
    let score = Infinity;
    let indices = null;
    let rgx = /\b\w/g;
    while (true) {
      let rgxMatch = rgx.exec(source);
      if (!rgxMatch) {
        break;
      }
      let match = import_algorithm2.StringExt.matchSumOfDeltas(source, query, rgxMatch.index);
      if (!match) {
        break;
      }
      if (match.score <= score) {
        score = match.score;
        indices = match.indices;
      }
    }
    if (!indices || score === Infinity) {
      return null;
    }
    let pivot = category.length + 1;
    let j = import_algorithm2.ArrayExt.lowerBound(indices, pivot, (a, b) => a - b);
    let categoryIndices = indices.slice(0, j);
    let labelIndices = indices.slice(j);
    for (let i = 0, n = labelIndices.length; i < n; ++i) {
      labelIndices[i] -= pivot;
    }
    if (categoryIndices.length === 0) {
      return {
        matchType: 0,
        categoryIndices: null,
        labelIndices,
        score,
        item
      };
    }
    if (labelIndices.length === 0) {
      return {
        matchType: 1,
        categoryIndices,
        labelIndices: null,
        score,
        item
      };
    }
    return {
      matchType: 2,
      categoryIndices,
      labelIndices,
      score,
      item
    };
  }
  function scoreCmp(a, b) {
    let m1 = a.matchType - b.matchType;
    if (m1 !== 0) {
      return m1;
    }
    let d1 = a.score - b.score;
    if (d1 !== 0) {
      return d1;
    }
    let i1 = 0;
    let i2 = 0;
    switch (a.matchType) {
      case 0:
        i1 = a.labelIndices[0];
        i2 = b.labelIndices[0];
        break;
      case 1:
      case 2:
        i1 = a.categoryIndices[0];
        i2 = b.categoryIndices[0];
        break;
    }
    if (i1 !== i2) {
      return i1 - i2;
    }
    let d2 = a.item.category.localeCompare(b.item.category);
    if (d2 !== 0) {
      return d2;
    }
    let r1 = a.item.rank;
    let r2 = b.item.rank;
    if (r1 !== r2) {
      return r1 < r2 ? -1 : 1;
    }
    return a.item.label.localeCompare(b.item.label);
  }
  function createResults(scores) {
    let results = [];
    for (let i = 0, n = scores.length; i < n; ++i) {
      let { item, categoryIndices, labelIndices } = scores[i];
      let category = item.category;
      if (i === 0 || category !== scores[i - 1].item.category) {
        results.push({ type: "header", category, indices: categoryIndices });
      }
      results.push({ type: "item", item, indices: labelIndices });
    }
    return results;
  }
  class CommandItem {
    /**
     * Construct a new command item.
     */
    constructor(commands, options) {
      this._commands = commands;
      this.category = normalizeCategory(options.category);
      this.command = options.command;
      this.args = options.args || import_coreutils4.JSONExt.emptyObject;
      this.rank = options.rank !== void 0 ? options.rank : Infinity;
    }
    /**
     * The display label for the command item.
     */
    get label() {
      return this._commands.label(this.command, this.args);
    }
    /**
     * The icon renderer for the command item.
     */
    get icon() {
      return this._commands.icon(this.command, this.args);
    }
    /**
     * The icon class for the command item.
     */
    get iconClass() {
      return this._commands.iconClass(this.command, this.args);
    }
    /**
     * The icon label for the command item.
     */
    get iconLabel() {
      return this._commands.iconLabel(this.command, this.args);
    }
    /**
     * The display caption for the command item.
     */
    get caption() {
      return this._commands.caption(this.command, this.args);
    }
    /**
     * The extra class name for the command item.
     */
    get className() {
      return this._commands.className(this.command, this.args);
    }
    /**
     * The dataset for the command item.
     */
    get dataset() {
      return this._commands.dataset(this.command, this.args);
    }
    /**
     * Whether the command item is enabled.
     */
    get isEnabled() {
      return this._commands.isEnabled(this.command, this.args);
    }
    /**
     * Whether the command item is toggled.
     */
    get isToggled() {
      return this._commands.isToggled(this.command, this.args);
    }
    /**
     * Whether the command item is toggleable.
     */
    get isToggleable() {
      return this._commands.isToggleable(this.command, this.args);
    }
    /**
     * Whether the command item is visible.
     */
    get isVisible() {
      return this._commands.isVisible(this.command, this.args);
    }
    /**
     * The key binding for the command item.
     */
    get keyBinding() {
      let { command, args } = this;
      return import_algorithm2.ArrayExt.findLastValue(this._commands.keyBindings, (kb) => {
        return kb.command === command && import_coreutils4.JSONExt.deepEqual(kb.args, args);
      }) || null;
    }
  }
})(Private$a || (Private$a = {}));
var Menu = class _Menu extends Widget {
  /**
   * Construct a new menu.
   *
   * @param options - The options for initializing the menu.
   */
  constructor(options) {
    super({ node: Private$9.createNode() });
    this._childIndex = -1;
    this._activeIndex = -1;
    this._openTimerID = 0;
    this._closeTimerID = 0;
    this._items = [];
    this._childMenu = null;
    this._parentMenu = null;
    this._aboutToClose = new import_signaling2.Signal(this);
    this._menuRequested = new import_signaling2.Signal(this);
    this.addClass("lm-Menu");
    this.setFlag(Widget.Flag.DisallowLayout);
    this.commands = options.commands;
    this.renderer = options.renderer || _Menu.defaultRenderer;
  }
  /**
   * Dispose of the resources held by the menu.
   */
  dispose() {
    this.close();
    this._items.length = 0;
    super.dispose();
  }
  /**
   * A signal emitted just before the menu is closed.
   *
   * #### Notes
   * This signal is emitted when the menu receives a `'close-request'`
   * message, just before it removes itself from the DOM.
   *
   * This signal is not emitted if the menu is already detached from
   * the DOM when it receives the `'close-request'` message.
   */
  get aboutToClose() {
    return this._aboutToClose;
  }
  /**
   * A signal emitted when a new menu is requested by the user.
   *
   * #### Notes
   * This signal is emitted whenever the user presses the right or left
   * arrow keys, and a submenu cannot be opened or closed in response.
   *
   * This signal is useful when implementing menu bars in order to open
   * the next or previous menu in response to a user key press.
   *
   * This signal is only emitted for the root menu in a hierarchy.
   */
  get menuRequested() {
    return this._menuRequested;
  }
  /**
   * The parent menu of the menu.
   *
   * #### Notes
   * This is `null` unless the menu is an open submenu.
   */
  get parentMenu() {
    return this._parentMenu;
  }
  /**
   * The child menu of the menu.
   *
   * #### Notes
   * This is `null` unless the menu has an open submenu.
   */
  get childMenu() {
    return this._childMenu;
  }
  /**
   * The root menu of the menu hierarchy.
   */
  get rootMenu() {
    let menu = this;
    while (menu._parentMenu) {
      menu = menu._parentMenu;
    }
    return menu;
  }
  /**
   * The leaf menu of the menu hierarchy.
   */
  get leafMenu() {
    let menu = this;
    while (menu._childMenu) {
      menu = menu._childMenu;
    }
    return menu;
  }
  /**
   * The menu content node.
   *
   * #### Notes
   * This is the node which holds the menu item nodes.
   *
   * Modifying this node directly can lead to undefined behavior.
   */
  get contentNode() {
    return this.node.getElementsByClassName("lm-Menu-content")[0];
  }
  /**
   * Get the currently active menu item.
   */
  get activeItem() {
    return this._items[this._activeIndex] || null;
  }
  /**
   * Set the currently active menu item.
   *
   * #### Notes
   * If the item cannot be activated, the item will be set to `null`.
   */
  set activeItem(value) {
    this.activeIndex = value ? this._items.indexOf(value) : -1;
  }
  /**
   * Get the index of the currently active menu item.
   *
   * #### Notes
   * This will be `-1` if no menu item is active.
   */
  get activeIndex() {
    return this._activeIndex;
  }
  /**
   * Set the index of the currently active menu item.
   *
   * #### Notes
   * If the item cannot be activated, the index will be set to `-1`.
   */
  set activeIndex(value) {
    if (value < 0 || value >= this._items.length) {
      value = -1;
    }
    if (value !== -1 && !Private$9.canActivate(this._items[value])) {
      value = -1;
    }
    if (this._activeIndex === value) {
      return;
    }
    this._activeIndex = value;
    if (this._activeIndex >= 0 && this.contentNode.childNodes[this._activeIndex]) {
      this.contentNode.childNodes[this._activeIndex].focus();
    }
    this.update();
  }
  /**
   * A read-only array of the menu items in the menu.
   */
  get items() {
    return this._items;
  }
  /**
   * Activate the next selectable item in the menu.
   *
   * #### Notes
   * If no item is selectable, the index will be set to `-1`.
   */
  activateNextItem() {
    let n = this._items.length;
    let ai = this._activeIndex;
    let start = ai < n - 1 ? ai + 1 : 0;
    let stop = start === 0 ? n - 1 : start - 1;
    this.activeIndex = import_algorithm2.ArrayExt.findFirstIndex(this._items, Private$9.canActivate, start, stop);
  }
  /**
   * Activate the previous selectable item in the menu.
   *
   * #### Notes
   * If no item is selectable, the index will be set to `-1`.
   */
  activatePreviousItem() {
    let n = this._items.length;
    let ai = this._activeIndex;
    let start = ai <= 0 ? n - 1 : ai - 1;
    let stop = start === n - 1 ? 0 : start + 1;
    this.activeIndex = import_algorithm2.ArrayExt.findLastIndex(this._items, Private$9.canActivate, start, stop);
  }
  /**
   * Trigger the active menu item.
   *
   * #### Notes
   * If the active item is a submenu, it will be opened and the first
   * item will be activated.
   *
   * If the active item is a command, the command will be executed.
   *
   * If the menu is not attached, this is a no-op.
   *
   * If there is no active item, this is a no-op.
   */
  triggerActiveItem() {
    if (!this.isAttached) {
      return;
    }
    let item = this.activeItem;
    if (!item) {
      return;
    }
    this._cancelOpenTimer();
    this._cancelCloseTimer();
    if (item.type === "submenu") {
      this._openChildMenu(true);
      return;
    }
    this.rootMenu.close();
    let { command, args } = item;
    if (this.commands.isEnabled(command, args)) {
      this.commands.execute(command, args);
    } else {
      console.log(`Command '${command}' is disabled.`);
    }
  }
  /**
   * Add a menu item to the end of the menu.
   *
   * @param options - The options for creating the menu item.
   *
   * @returns The menu item added to the menu.
   */
  addItem(options) {
    return this.insertItem(this._items.length, options);
  }
  /**
   * Insert a menu item into the menu at the specified index.
   *
   * @param index - The index at which to insert the item.
   *
   * @param options - The options for creating the menu item.
   *
   * @returns The menu item added to the menu.
   *
   * #### Notes
   * The index will be clamped to the bounds of the items.
   */
  insertItem(index, options) {
    if (this.isAttached) {
      this.close();
    }
    this.activeIndex = -1;
    let i = Math.max(0, Math.min(index, this._items.length));
    let item = Private$9.createItem(this, options);
    import_algorithm2.ArrayExt.insert(this._items, i, item);
    this.update();
    return item;
  }
  /**
   * Remove an item from the menu.
   *
   * @param item - The item to remove from the menu.
   *
   * #### Notes
   * This is a no-op if the item is not in the menu.
   */
  removeItem(item) {
    let index = this._items.indexOf(item);
    if (index === -1) {
      return;
    }
    this.removeItemAt(index);
  }
  /**
   * Remove the item at a given index from the menu.
   *
   * @param index - The index of the item to remove.
   *
   * #### Notes
   * This is a no-op if the index is out of range.
   */
  removeItemAt(index) {
    if (this.isAttached) {
      this.close();
    }
    this.activeIndex = -1;
    let item = import_algorithm2.ArrayExt.removeAt(this._items, index);
    if (!item) {
      return;
    }
    this.update();
  }
  /**
   * Remove all menu items from the menu.
   */
  clearItems() {
    if (this.isAttached) {
      this.close();
    }
    this.activeIndex = -1;
    if (this._items.length === 0) {
      return;
    }
    this._items.length = 0;
    this.update();
  }
  /**
   * Open the menu at the specified location.
   *
   * @param x - The client X coordinate of the menu location.
   *
   * @param y - The client Y coordinate of the menu location.
   *
   * @param options - The additional options for opening the menu.
   *
   * #### Notes
   * The menu will be opened at the given location unless it will not
   * fully fit on the screen. If it will not fit, it will be adjusted
   * to fit naturally on the screen.
   *
   * The menu will be attached under the `host` element in the DOM
   * (or `document.body` if `host` is `null`) and before the `ref`
   * element (or as the last child of `host` if `ref` is `null`).
   * The menu may be displayed outside of the `host` element
   * following the rules of CSS absolute positioning.
   *
   * This is a no-op if the menu is already attached to the DOM.
   */
  open(x, y, options = {}) {
    var _a, _b, _c;
    if (this.isAttached) {
      return;
    }
    let forceX = options.forceX || false;
    let forceY = options.forceY || false;
    const host = (_a = options.host) !== null && _a !== void 0 ? _a : null;
    const ref = (_b = options.ref) !== null && _b !== void 0 ? _b : null;
    const horizontalAlignment = (_c = options.horizontalAlignment) !== null && _c !== void 0 ? _c : document.documentElement.dir === "rtl" ? "right" : "left";
    Private$9.openRootMenu(this, x, y, forceX, forceY, horizontalAlignment, host, ref);
    this.activate();
  }
  /**
   * Handle the DOM events for the menu.
   *
   * @param event - The DOM event sent to the menu.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the menu's DOM nodes. It should
   * not be called directly by user code.
   */
  handleEvent(event) {
    switch (event.type) {
      case "keydown":
        this._evtKeyDown(event);
        break;
      case "pointerup":
        this._evtPointerUp(event);
        break;
      case "pointermove":
        this._evtPointerMove(event);
        break;
      case "pointerenter":
        this._evtPointerEnter(event);
        break;
      case "pointerleave":
        this._evtPointerLeave(event);
        break;
      case "pointerdown":
        this._evtPointerDown(event);
        break;
      case "contextmenu":
        event.preventDefault();
        event.stopPropagation();
        break;
    }
  }
  /**
   * A message handler invoked on a `'before-attach'` message.
   */
  onBeforeAttach(msg) {
    this.node.addEventListener("keydown", this);
    this.node.addEventListener("pointerup", this);
    this.node.addEventListener("pointermove", this);
    this.node.addEventListener("pointerenter", this);
    this.node.addEventListener("pointerleave", this);
    this.node.addEventListener("contextmenu", this);
    document.addEventListener("pointerdown", this, true);
  }
  /**
   * A message handler invoked on an `'after-detach'` message.
   */
  onAfterDetach(msg) {
    this.node.removeEventListener("keydown", this);
    this.node.removeEventListener("pointerup", this);
    this.node.removeEventListener("pointermove", this);
    this.node.removeEventListener("pointerenter", this);
    this.node.removeEventListener("pointerleave", this);
    this.node.removeEventListener("contextmenu", this);
    document.removeEventListener("pointerdown", this, true);
  }
  /**
   * A message handler invoked on an `'activate-request'` message.
   */
  onActivateRequest(msg) {
    if (this.isAttached) {
      this.node.focus();
    }
  }
  /**
   * A message handler invoked on an `'update-request'` message.
   */
  onUpdateRequest(msg) {
    let items = this._items;
    let renderer = this.renderer;
    let activeIndex = this._activeIndex;
    let collapsedFlags = Private$9.computeCollapsed(items);
    let content = new Array(items.length);
    for (let i = 0, n = items.length; i < n; ++i) {
      let item = items[i];
      let active = i === activeIndex;
      let collapsed = collapsedFlags[i];
      content[i] = renderer.renderItem({
        item,
        active,
        collapsed,
        onfocus: () => {
          this.activeIndex = i;
        }
      });
    }
    import_virtualdom.VirtualDOM.render(content, this.contentNode);
  }
  /**
   * A message handler invoked on a `'close-request'` message.
   */
  onCloseRequest(msg) {
    this._cancelOpenTimer();
    this._cancelCloseTimer();
    this.activeIndex = -1;
    let childMenu = this._childMenu;
    if (childMenu) {
      this._childIndex = -1;
      this._childMenu = null;
      childMenu._parentMenu = null;
      childMenu.close();
    }
    let parentMenu = this._parentMenu;
    if (parentMenu) {
      this._parentMenu = null;
      parentMenu._childIndex = -1;
      parentMenu._childMenu = null;
      parentMenu.activate();
    }
    if (this.isAttached) {
      this._aboutToClose.emit(void 0);
    }
    super.onCloseRequest(msg);
  }
  /**
   * Handle the `'keydown'` event for the menu.
   *
   * #### Notes
   * This listener is attached to the menu node.
   */
  _evtKeyDown(event) {
    event.preventDefault();
    event.stopPropagation();
    let kc = event.keyCode;
    if (kc === 13) {
      this.triggerActiveItem();
      return;
    }
    if (kc === 27) {
      this.close();
      return;
    }
    if (kc === 37) {
      if (this._parentMenu) {
        this.close();
      } else {
        this._menuRequested.emit("previous");
      }
      return;
    }
    if (kc === 38) {
      this.activatePreviousItem();
      return;
    }
    if (kc === 39) {
      let item = this.activeItem;
      if (item && item.type === "submenu") {
        this.triggerActiveItem();
      } else {
        this.rootMenu._menuRequested.emit("next");
      }
      return;
    }
    if (kc === 40) {
      this.activateNextItem();
      return;
    }
    let key = getKeyboardLayout().keyForKeydownEvent(event);
    if (!key) {
      return;
    }
    let start = this._activeIndex + 1;
    let result = Private$9.findMnemonic(this._items, key, start);
    if (result.index !== -1 && !result.multiple) {
      this.activeIndex = result.index;
      this.triggerActiveItem();
    } else if (result.index !== -1) {
      this.activeIndex = result.index;
    } else if (result.auto !== -1) {
      this.activeIndex = result.auto;
    }
  }
  /**
   * Handle the `'pointerup'` event for the menu.
   *
   * #### Notes
   * This listener is attached to the menu node.
   */
  _evtPointerUp(event) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.triggerActiveItem();
  }
  /**
   * Handle the `'pointermove'` event for the menu.
   *
   * #### Notes
   * This listener is attached to the menu node.
   */
  _evtPointerMove(event) {
    let index = import_algorithm2.ArrayExt.findFirstIndex(this.contentNode.children, (node) => {
      return import_domutils2.ElementExt.hitTest(node, event.clientX, event.clientY);
    });
    if (index === this._activeIndex) {
      return;
    }
    this.activeIndex = index;
    index = this.activeIndex;
    if (index === this._childIndex) {
      this._cancelOpenTimer();
      this._cancelCloseTimer();
      return;
    }
    if (this._childIndex !== -1) {
      this._startCloseTimer();
    }
    this._cancelOpenTimer();
    let item = this.activeItem;
    if (!item || item.type !== "submenu" || !item.submenu) {
      return;
    }
    this._startOpenTimer();
  }
  /**
   * Handle the `'pointerenter'` event for the menu.
   *
   * #### Notes
   * This listener is attached to the menu node.
   */
  _evtPointerEnter(event) {
    for (let menu = this._parentMenu; menu; menu = menu._parentMenu) {
      menu._cancelOpenTimer();
      menu._cancelCloseTimer();
      menu.activeIndex = menu._childIndex;
    }
  }
  /**
   * Handle the `'pointerleave'` event for the menu.
   *
   * #### Notes
   * This listener is attached to the menu node.
   */
  _evtPointerLeave(event) {
    this._cancelOpenTimer();
    if (!this._childMenu) {
      this.activeIndex = -1;
      return;
    }
    let { clientX, clientY } = event;
    if (import_domutils2.ElementExt.hitTest(this._childMenu.node, clientX, clientY)) {
      this._cancelCloseTimer();
      return;
    }
    this.activeIndex = -1;
    this._startCloseTimer();
  }
  /**
   * Handle the `'pointerdown'` event for the menu.
   *
   * #### Notes
   * This listener is attached to the document node.
   */
  _evtPointerDown(event) {
    if (this._parentMenu) {
      return;
    }
    if (Private$9.hitTestMenus(this, event.clientX, event.clientY)) {
      event.preventDefault();
      event.stopPropagation();
    } else {
      this.close();
    }
  }
  /**
   * Open the child menu at the active index immediately.
   *
   * If a different child menu is already open, it will be closed,
   * even if the active item is not a valid submenu.
   */
  _openChildMenu(activateFirst = false) {
    let item = this.activeItem;
    if (!item || item.type !== "submenu" || !item.submenu) {
      this._closeChildMenu();
      return;
    }
    let submenu = item.submenu;
    if (submenu === this._childMenu) {
      return;
    }
    _Menu.saveWindowData();
    this._closeChildMenu();
    this._childMenu = submenu;
    this._childIndex = this._activeIndex;
    submenu._parentMenu = this;
    import_messaging.MessageLoop.sendMessage(this, Widget.Msg.UpdateRequest);
    let itemNode = this.contentNode.children[this._activeIndex];
    Private$9.openSubmenu(submenu, itemNode);
    if (activateFirst) {
      submenu.activeIndex = -1;
      submenu.activateNextItem();
    }
    submenu.activate();
  }
  /**
   * Close the child menu immediately.
   *
   * This is a no-op if a child menu is not open.
   */
  _closeChildMenu() {
    if (this._childMenu) {
      this._childMenu.close();
    }
  }
  /**
   * Start the open timer, unless it is already pending.
   */
  _startOpenTimer() {
    if (this._openTimerID === 0) {
      this._openTimerID = window.setTimeout(() => {
        this._openTimerID = 0;
        this._openChildMenu();
      }, Private$9.TIMER_DELAY);
    }
  }
  /**
   * Start the close timer, unless it is already pending.
   */
  _startCloseTimer() {
    if (this._closeTimerID === 0) {
      this._closeTimerID = window.setTimeout(() => {
        this._closeTimerID = 0;
        this._closeChildMenu();
      }, Private$9.TIMER_DELAY);
    }
  }
  /**
   * Cancel the open timer, if the timer is pending.
   */
  _cancelOpenTimer() {
    if (this._openTimerID !== 0) {
      clearTimeout(this._openTimerID);
      this._openTimerID = 0;
    }
  }
  /**
   * Cancel the close timer, if the timer is pending.
   */
  _cancelCloseTimer() {
    if (this._closeTimerID !== 0) {
      clearTimeout(this._closeTimerID);
      this._closeTimerID = 0;
    }
  }
  /**
   * Save window data used for menu positioning in transient cache.
   *
   * In order to avoid layout trashing it is recommended to invoke this
   * method immediately prior to opening the menu and any DOM modifications
   * (like closing previously visible menu, or adding a class to menu widget).
   *
   * The transient cache will be released upon `open()` call.
   */
  static saveWindowData() {
    Private$9.saveWindowData();
  }
};
(function(Menu2) {
  class Renderer {
    /**
     * Render the virtual element for a menu item.
     *
     * @param data - The data to use for rendering the item.
     *
     * @returns A virtual element representing the item.
     */
    renderItem(data) {
      let className = this.createItemClass(data);
      let dataset = this.createItemDataset(data);
      let aria = this.createItemARIA(data);
      return import_virtualdom.h.li({
        className,
        dataset,
        tabindex: "0",
        onfocus: data.onfocus,
        ...aria
      }, this.renderIcon(data), this.renderLabel(data), this.renderShortcut(data), this.renderSubmenu(data));
    }
    /**
     * Render the icon element for a menu item.
     *
     * @param data - The data to use for rendering the icon.
     *
     * @returns A virtual element representing the item icon.
     */
    renderIcon(data) {
      let className = this.createIconClass(data);
      return import_virtualdom.h.div({ className }, data.item.icon, data.item.iconLabel);
    }
    /**
     * Render the label element for a menu item.
     *
     * @param data - The data to use for rendering the label.
     *
     * @returns A virtual element representing the item label.
     */
    renderLabel(data) {
      let content = this.formatLabel(data);
      return import_virtualdom.h.div({ className: "lm-Menu-itemLabel" }, content);
    }
    /**
     * Render the shortcut element for a menu item.
     *
     * @param data - The data to use for rendering the shortcut.
     *
     * @returns A virtual element representing the item shortcut.
     */
    renderShortcut(data) {
      let content = this.formatShortcut(data);
      return import_virtualdom.h.div({ className: "lm-Menu-itemShortcut" }, content);
    }
    /**
     * Render the submenu icon element for a menu item.
     *
     * @param data - The data to use for rendering the submenu icon.
     *
     * @returns A virtual element representing the submenu icon.
     */
    renderSubmenu(data) {
      return import_virtualdom.h.div({ className: "lm-Menu-itemSubmenuIcon" });
    }
    /**
     * Create the class name for the menu item.
     *
     * @param data - The data to use for the class name.
     *
     * @returns The full class name for the menu item.
     */
    createItemClass(data) {
      let name = "lm-Menu-item";
      if (!data.item.isEnabled) {
        name += " lm-mod-disabled";
      }
      if (data.item.isToggled) {
        name += " lm-mod-toggled";
      }
      if (!data.item.isVisible) {
        name += " lm-mod-hidden";
      }
      if (data.active) {
        name += " lm-mod-active";
      }
      if (data.collapsed) {
        name += " lm-mod-collapsed";
      }
      let extra = data.item.className;
      if (extra) {
        name += ` ${extra}`;
      }
      return name;
    }
    /**
     * Create the dataset for the menu item.
     *
     * @param data - The data to use for creating the dataset.
     *
     * @returns The dataset for the menu item.
     */
    createItemDataset(data) {
      let result;
      let { type, command, dataset } = data.item;
      if (type === "command") {
        result = { ...dataset, type, command };
      } else {
        result = { ...dataset, type };
      }
      return result;
    }
    /**
     * Create the class name for the menu item icon.
     *
     * @param data - The data to use for the class name.
     *
     * @returns The full class name for the item icon.
     */
    createIconClass(data) {
      let name = "lm-Menu-itemIcon";
      let extra = data.item.iconClass;
      return extra ? `${name} ${extra}` : name;
    }
    /**
     * Create the aria attributes for menu item.
     *
     * @param data - The data to use for the aria attributes.
     *
     * @returns The aria attributes object for the item.
     */
    createItemARIA(data) {
      let aria = {};
      switch (data.item.type) {
        case "separator":
          aria.role = "presentation";
          break;
        case "submenu":
          aria["aria-haspopup"] = "true";
          if (!data.item.isEnabled) {
            aria["aria-disabled"] = "true";
          }
          break;
        default:
          if (!data.item.isEnabled) {
            aria["aria-disabled"] = "true";
          }
          if (data.item.isToggled) {
            aria.role = "menuitemcheckbox";
            aria["aria-checked"] = "true";
          } else {
            aria.role = "menuitem";
          }
      }
      return aria;
    }
    /**
     * Create the render content for the label node.
     *
     * @param data - The data to use for the label content.
     *
     * @returns The content to add to the label node.
     */
    formatLabel(data) {
      let { label, mnemonic } = data.item;
      if (mnemonic < 0 || mnemonic >= label.length) {
        return label;
      }
      let prefix = label.slice(0, mnemonic);
      let suffix = label.slice(mnemonic + 1);
      let char = label[mnemonic];
      let span = import_virtualdom.h.span({ className: "lm-Menu-itemMnemonic" }, char);
      return [prefix, span, suffix];
    }
    /**
     * Create the render content for the shortcut node.
     *
     * @param data - The data to use for the shortcut content.
     *
     * @returns The content to add to the shortcut node.
     */
    formatShortcut(data) {
      let kb = data.item.keyBinding;
      return kb ? CommandRegistry.formatKeystroke(kb.keys) : null;
    }
  }
  Menu2.Renderer = Renderer;
  Menu2.defaultRenderer = new Renderer();
})(Menu || (Menu = {}));
var Private$9;
(function(Private6) {
  Private6.TIMER_DELAY = 300;
  Private6.SUBMENU_OVERLAP = 3;
  let transientWindowDataCache = null;
  let transientCacheCounter = 0;
  function getWindowData() {
    if (transientCacheCounter > 0) {
      transientCacheCounter--;
      return transientWindowDataCache;
    }
    return _getWindowData();
  }
  function saveWindowData() {
    transientWindowDataCache = _getWindowData();
    transientCacheCounter++;
  }
  Private6.saveWindowData = saveWindowData;
  function createNode() {
    let node = document.createElement("div");
    let content = document.createElement("ul");
    content.className = "lm-Menu-content";
    node.appendChild(content);
    content.setAttribute("role", "menu");
    node.tabIndex = 0;
    return node;
  }
  Private6.createNode = createNode;
  function canActivate(item) {
    return item.type !== "separator" && item.isEnabled && item.isVisible;
  }
  Private6.canActivate = canActivate;
  function createItem(owner, options) {
    return new MenuItem(owner.commands, options);
  }
  Private6.createItem = createItem;
  function hitTestMenus(menu, x, y) {
    for (let temp = menu; temp; temp = temp.childMenu) {
      if (import_domutils2.ElementExt.hitTest(temp.node, x, y)) {
        return true;
      }
    }
    return false;
  }
  Private6.hitTestMenus = hitTestMenus;
  function computeCollapsed(items) {
    let result = new Array(items.length);
    import_algorithm2.ArrayExt.fill(result, false);
    let k1 = 0;
    let n = items.length;
    for (; k1 < n; ++k1) {
      let item = items[k1];
      if (!item.isVisible) {
        continue;
      }
      if (item.type !== "separator") {
        break;
      }
      result[k1] = true;
    }
    let k2 = n - 1;
    for (; k2 >= 0; --k2) {
      let item = items[k2];
      if (!item.isVisible) {
        continue;
      }
      if (item.type !== "separator") {
        break;
      }
      result[k2] = true;
    }
    let hide = false;
    while (++k1 < k2) {
      let item = items[k1];
      if (!item.isVisible) {
        continue;
      }
      if (item.type !== "separator") {
        hide = false;
      } else if (hide) {
        result[k1] = true;
      } else {
        hide = true;
      }
    }
    return result;
  }
  Private6.computeCollapsed = computeCollapsed;
  function _getWindowData() {
    return {
      pageXOffset: window.pageXOffset,
      pageYOffset: window.pageYOffset,
      clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight
    };
  }
  function openRootMenu(menu, x, y, forceX, forceY, horizontalAlignment, host, ref) {
    const windowData = getWindowData();
    let px = windowData.pageXOffset;
    let py = windowData.pageYOffset;
    let cw = windowData.clientWidth;
    let ch = windowData.clientHeight;
    import_messaging.MessageLoop.sendMessage(menu, Widget.Msg.UpdateRequest);
    let maxHeight = ch - (forceY ? y : 0);
    let node = menu.node;
    let style = node.style;
    style.opacity = "0";
    style.maxHeight = `${maxHeight}px`;
    Widget.attach(menu, host || document.body, ref);
    let { width, height } = node.getBoundingClientRect();
    if (horizontalAlignment === "right") {
      x -= width;
    }
    if (!forceX && x + width > px + cw) {
      x = px + cw - width;
    }
    if (!forceY && y + height > py + ch) {
      if (y > py + ch) {
        y = py + ch - height;
      } else {
        y = y - height;
      }
    }
    style.transform = `translate(${Math.max(0, x)}px, ${Math.max(0, y)}px`;
    style.opacity = "1";
  }
  Private6.openRootMenu = openRootMenu;
  function openSubmenu(submenu, itemNode) {
    const windowData = getWindowData();
    let px = windowData.pageXOffset;
    let py = windowData.pageYOffset;
    let cw = windowData.clientWidth;
    let ch = windowData.clientHeight;
    import_messaging.MessageLoop.sendMessage(submenu, Widget.Msg.UpdateRequest);
    let maxHeight = ch;
    let node = submenu.node;
    let style = node.style;
    style.opacity = "0";
    style.maxHeight = `${maxHeight}px`;
    Widget.attach(submenu, document.body);
    let { width, height } = node.getBoundingClientRect();
    let box = import_domutils2.ElementExt.boxSizing(submenu.node);
    let itemRect = itemNode.getBoundingClientRect();
    let x = itemRect.right - Private6.SUBMENU_OVERLAP;
    if (x + width > px + cw) {
      x = itemRect.left + Private6.SUBMENU_OVERLAP - width;
    }
    let y = itemRect.top - box.borderTop - box.paddingTop;
    if (y + height > py + ch) {
      y = itemRect.bottom + box.borderBottom + box.paddingBottom - height;
    }
    style.transform = `translate(${Math.max(0, x)}px, ${Math.max(0, y)}px`;
    style.opacity = "1";
  }
  Private6.openSubmenu = openSubmenu;
  function findMnemonic(items, key, start) {
    let index = -1;
    let auto = -1;
    let multiple = false;
    let upperKey = key.toUpperCase();
    for (let i = 0, n = items.length; i < n; ++i) {
      let k = (i + start) % n;
      let item = items[k];
      if (!canActivate(item)) {
        continue;
      }
      let label = item.label;
      if (label.length === 0) {
        continue;
      }
      let mn = item.mnemonic;
      if (mn >= 0 && mn < label.length) {
        if (label[mn].toUpperCase() === upperKey) {
          if (index === -1) {
            index = k;
          } else {
            multiple = true;
          }
        }
        continue;
      }
      if (auto === -1 && label[0].toUpperCase() === upperKey) {
        auto = k;
      }
    }
    return { index, multiple, auto };
  }
  Private6.findMnemonic = findMnemonic;
  class MenuItem {
    /**
     * Construct a new menu item.
     */
    constructor(commands, options) {
      this._commands = commands;
      this.type = options.type || "command";
      this.command = options.command || "";
      this.args = options.args || import_coreutils4.JSONExt.emptyObject;
      this.submenu = options.submenu || null;
    }
    /**
     * The display label for the menu item.
     */
    get label() {
      if (this.type === "command") {
        return this._commands.label(this.command, this.args);
      }
      if (this.type === "submenu" && this.submenu) {
        return this.submenu.title.label;
      }
      return "";
    }
    /**
     * The mnemonic index for the menu item.
     */
    get mnemonic() {
      if (this.type === "command") {
        return this._commands.mnemonic(this.command, this.args);
      }
      if (this.type === "submenu" && this.submenu) {
        return this.submenu.title.mnemonic;
      }
      return -1;
    }
    /**
     * The icon renderer for the menu item.
     */
    get icon() {
      if (this.type === "command") {
        return this._commands.icon(this.command, this.args);
      }
      if (this.type === "submenu" && this.submenu) {
        return this.submenu.title.icon;
      }
      return void 0;
    }
    /**
     * The icon class for the menu item.
     */
    get iconClass() {
      if (this.type === "command") {
        return this._commands.iconClass(this.command, this.args);
      }
      if (this.type === "submenu" && this.submenu) {
        return this.submenu.title.iconClass;
      }
      return "";
    }
    /**
     * The icon label for the menu item.
     */
    get iconLabel() {
      if (this.type === "command") {
        return this._commands.iconLabel(this.command, this.args);
      }
      if (this.type === "submenu" && this.submenu) {
        return this.submenu.title.iconLabel;
      }
      return "";
    }
    /**
     * The display caption for the menu item.
     */
    get caption() {
      if (this.type === "command") {
        return this._commands.caption(this.command, this.args);
      }
      if (this.type === "submenu" && this.submenu) {
        return this.submenu.title.caption;
      }
      return "";
    }
    /**
     * The extra class name for the menu item.
     */
    get className() {
      if (this.type === "command") {
        return this._commands.className(this.command, this.args);
      }
      if (this.type === "submenu" && this.submenu) {
        return this.submenu.title.className;
      }
      return "";
    }
    /**
     * The dataset for the menu item.
     */
    get dataset() {
      if (this.type === "command") {
        return this._commands.dataset(this.command, this.args);
      }
      if (this.type === "submenu" && this.submenu) {
        return this.submenu.title.dataset;
      }
      return {};
    }
    /**
     * Whether the menu item is enabled.
     */
    get isEnabled() {
      if (this.type === "command") {
        return this._commands.isEnabled(this.command, this.args);
      }
      if (this.type === "submenu") {
        return this.submenu !== null;
      }
      return true;
    }
    /**
     * Whether the menu item is toggled.
     */
    get isToggled() {
      if (this.type === "command") {
        return this._commands.isToggled(this.command, this.args);
      }
      return false;
    }
    /**
     * Whether the menu item is visible.
     */
    get isVisible() {
      if (this.type === "command") {
        return this._commands.isVisible(this.command, this.args);
      }
      if (this.type === "submenu") {
        return this.submenu !== null;
      }
      return true;
    }
    /**
     * The key binding for the menu item.
     */
    get keyBinding() {
      if (this.type === "command") {
        let { command, args } = this;
        return import_algorithm2.ArrayExt.findLastValue(this._commands.keyBindings, (kb) => {
          return kb.command === command && import_coreutils4.JSONExt.deepEqual(kb.args, args);
        }) || null;
      }
      return null;
    }
  }
})(Private$9 || (Private$9 = {}));
var Private$8;
(function(Private6) {
  function createItem(options, id) {
    let selector = validateSelector(options.selector);
    let rank = options.rank !== void 0 ? options.rank : Infinity;
    return { ...options, selector, rank, id };
  }
  Private6.createItem = createItem;
  function matchItems(items, event, groupByTarget, sortBySelector) {
    let target = event.target;
    if (!target) {
      return null;
    }
    let currentTarget = event.currentTarget;
    if (!currentTarget) {
      return null;
    }
    if (!currentTarget.contains(target)) {
      target = document.elementFromPoint(event.clientX, event.clientY);
      if (!target || !currentTarget.contains(target)) {
        return null;
      }
    }
    let result = [];
    let availableItems = items.slice();
    while (target !== null) {
      let matches = [];
      for (let i = 0, n = availableItems.length; i < n; ++i) {
        let item = availableItems[i];
        if (!item) {
          continue;
        }
        if (!import_domutils2.Selector.matches(target, item.selector)) {
          continue;
        }
        matches.push(item);
        availableItems[i] = null;
      }
      if (matches.length !== 0) {
        if (groupByTarget) {
          matches.sort(sortBySelector ? itemCmp : itemCmpRank);
        }
        result.push(...matches);
      }
      if (target === currentTarget) {
        break;
      }
      target = target.parentElement;
    }
    if (!groupByTarget) {
      result.sort(sortBySelector ? itemCmp : itemCmpRank);
    }
    return result;
  }
  Private6.matchItems = matchItems;
  function validateSelector(selector) {
    if (selector.indexOf(",") !== -1) {
      throw new Error(`Selector cannot contain commas: ${selector}`);
    }
    if (!import_domutils2.Selector.isValid(selector)) {
      throw new Error(`Invalid selector: ${selector}`);
    }
    return selector;
  }
  function itemCmpRank(a, b) {
    let r1 = a.rank;
    let r2 = b.rank;
    if (r1 !== r2) {
      return r1 < r2 ? -1 : 1;
    }
    return a.id - b.id;
  }
  function itemCmp(a, b) {
    let s1 = import_domutils2.Selector.calculateSpecificity(a.selector);
    let s2 = import_domutils2.Selector.calculateSpecificity(b.selector);
    if (s1 !== s2) {
      return s2 - s1;
    }
    return itemCmpRank(a, b);
  }
})(Private$8 || (Private$8 = {}));
var ARROW_KEYS = [
  "ArrowLeft",
  "ArrowUp",
  "ArrowRight",
  "ArrowDown",
  "Home",
  "End"
];
var TabBar = class _TabBar extends Widget {
  /**
   * Construct a new tab bar.
   *
   * @param options - The options for initializing the tab bar.
   */
  constructor(options = {}) {
    super({ node: Private$7.createNode() });
    this._currentIndex = -1;
    this._titles = [];
    this._titlesEditable = false;
    this._previousTitle = null;
    this._dragData = null;
    this._tabSizeFrozen = false;
    this._frozenTabWidths = null;
    this._unfreezeRunID = 0;
    this._unfreezeFallbackTimerID = 0;
    this._unfreezeTransitionListener = null;
    this._addButtonEnabled = false;
    this._tabMoved = new import_signaling2.Signal(this);
    this._currentChanged = new import_signaling2.Signal(this);
    this._addRequested = new import_signaling2.Signal(this);
    this._tabCloseRequested = new import_signaling2.Signal(this);
    this._tabDetachRequested = new import_signaling2.Signal(this);
    this._tabActivateRequested = new import_signaling2.Signal(this);
    this.addClass("lm-TabBar");
    this.contentNode.setAttribute("role", "tablist");
    this.setFlag(Widget.Flag.DisallowLayout);
    this._document = options.document || document;
    this.tabsMovable = options.tabsMovable || false;
    this.titlesEditable = options.titlesEditable || false;
    this.allowDeselect = options.allowDeselect || false;
    this.addButtonEnabled = options.addButtonEnabled || false;
    this.insertBehavior = options.insertBehavior || "select-tab-if-needed";
    this.name = options.name || "";
    this.orientation = options.orientation || "horizontal";
    this.removeBehavior = options.removeBehavior || "select-tab-after";
    this.renderer = options.renderer || _TabBar.defaultRenderer;
  }
  /**
   * Dispose of the resources held by the widget.
   */
  dispose() {
    this._releaseMouse();
    this._titles.length = 0;
    this._previousTitle = null;
    super.dispose();
  }
  /**
   * A signal emitted when the current tab is changed.
   *
   * #### Notes
   * This signal is emitted when the currently selected tab is changed
   * either through user or programmatic interaction.
   *
   * Notably, this signal is not emitted when the index of the current
   * tab changes due to tabs being inserted, removed, or moved. It is
   * only emitted when the actual current tab node is changed.
   */
  get currentChanged() {
    return this._currentChanged;
  }
  /**
   * A signal emitted when a tab is moved by the user.
   *
   * #### Notes
   * This signal is emitted when a tab is moved by user interaction.
   *
   * This signal is not emitted when a tab is moved programmatically.
   */
  get tabMoved() {
    return this._tabMoved;
  }
  /**
   * A signal emitted when a tab is clicked by the user.
   *
   * #### Notes
   * If the clicked tab is not the current tab, the clicked tab will be
   * made current and the `currentChanged` signal will be emitted first.
   *
   * This signal is emitted even if the clicked tab is the current tab.
   */
  get tabActivateRequested() {
    return this._tabActivateRequested;
  }
  /**
   * A signal emitted when the tab bar add button is clicked.
   */
  get addRequested() {
    return this._addRequested;
  }
  /**
   * A signal emitted when a tab close icon is clicked.
   *
   * #### Notes
   * This signal is not emitted unless the tab title is `closable`.
   */
  get tabCloseRequested() {
    return this._tabCloseRequested;
  }
  /**
   * A signal emitted when a tab is dragged beyond the detach threshold.
   *
   * #### Notes
   * This signal is emitted when the user drags a tab with the mouse,
   * and mouse is dragged beyond the detach threshold.
   *
   * The consumer of the signal should call `releaseMouse` and remove
   * the tab in order to complete the detach.
   *
   * This signal is only emitted once per drag cycle.
   */
  get tabDetachRequested() {
    return this._tabDetachRequested;
  }
  /**
   * The document to use with the tab bar.
   *
   * The default is the global `document` instance.
   */
  get document() {
    return this._document;
  }
  /**
   * Whether the titles can be user-edited.
   *
   */
  get titlesEditable() {
    return this._titlesEditable;
  }
  /**
   * Set whether titles can be user edited.
   *
   */
  set titlesEditable(value) {
    this._titlesEditable = value;
  }
  /**
   * Get the currently selected title.
   *
   * #### Notes
   * This will be `null` if no tab is selected.
   */
  get currentTitle() {
    return this._titles[this._currentIndex] || null;
  }
  /**
   * Set the currently selected title.
   *
   * #### Notes
   * If the title does not exist, the title will be set to `null`.
   */
  set currentTitle(value) {
    this.currentIndex = value ? this._titles.indexOf(value) : -1;
  }
  /**
   * Get the index of the currently selected tab.
   *
   * #### Notes
   * This will be `-1` if no tab is selected.
   */
  get currentIndex() {
    return this._currentIndex;
  }
  /**
   * Set the index of the currently selected tab.
   *
   * #### Notes
   * If the value is out of range, the index will be set to `-1`.
   */
  set currentIndex(value) {
    if (value < 0 || value >= this._titles.length) {
      value = -1;
    }
    if (this._currentIndex === value) {
      return;
    }
    let pi = this._currentIndex;
    let pt = this._titles[pi] || null;
    let ci = value;
    let ct = this._titles[ci] || null;
    this._currentIndex = ci;
    this._previousTitle = pt;
    this.update();
    this._currentChanged.emit({
      previousIndex: pi,
      previousTitle: pt,
      currentIndex: ci,
      currentTitle: ct
    });
  }
  /**
   * Get the name of the tab bar.
   */
  get name() {
    return this._name;
  }
  /**
   * Set the name of the tab bar.
   */
  set name(value) {
    this._name = value;
    if (value) {
      this.contentNode.setAttribute("aria-label", value);
    } else {
      this.contentNode.removeAttribute("aria-label");
    }
  }
  /**
   * Get the orientation of the tab bar.
   *
   * #### Notes
   * This controls whether the tabs are arranged in a row or column.
   */
  get orientation() {
    return this._orientation;
  }
  /**
   * Set the orientation of the tab bar.
   *
   * #### Notes
   * This controls whether the tabs are arranged in a row or column.
   */
  set orientation(value) {
    if (this._orientation === value) {
      return;
    }
    this._releaseMouse();
    this._orientation = value;
    this.dataset["orientation"] = value;
    this.contentNode.setAttribute("aria-orientation", value);
  }
  /**
   * Whether the add button is enabled.
   */
  get addButtonEnabled() {
    return this._addButtonEnabled;
  }
  /**
   * Set whether the add button is enabled.
   */
  set addButtonEnabled(value) {
    if (this._addButtonEnabled === value) {
      return;
    }
    this._addButtonEnabled = value;
    if (value) {
      this.addButtonNode.classList.remove("lm-mod-hidden");
    } else {
      this.addButtonNode.classList.add("lm-mod-hidden");
    }
  }
  /**
   * A read-only array of the titles in the tab bar.
   */
  get titles() {
    return this._titles;
  }
  /**
   * The tab bar content node.
   *
   * #### Notes
   * This is the node which holds the tab nodes.
   *
   * Modifying this node directly can lead to undefined behavior.
   */
  get contentNode() {
    return this.node.getElementsByClassName("lm-TabBar-content")[0];
  }
  /**
   * The tab bar add button node.
   *
   * #### Notes
   * This is the node which holds the add button.
   *
   * Modifying this node directly can lead to undefined behavior.
   */
  get addButtonNode() {
    return this.node.getElementsByClassName("lm-TabBar-addButton")[0];
  }
  /**
   * Add a tab to the end of the tab bar.
   *
   * @param value - The title which holds the data for the tab,
   *   or an options object to convert to a title.
   *
   * @returns The title object added to the tab bar.
   *
   * #### Notes
   * If the title is already added to the tab bar, it will be moved.
   */
  addTab(value) {
    return this.insertTab(this._titles.length, value);
  }
  /**
   * Insert a tab into the tab bar at the specified index.
   *
   * @param index - The index at which to insert the tab.
   *
   * @param value - The title which holds the data for the tab,
   *   or an options object to convert to a title.
   *
   * @returns The title object added to the tab bar.
   *
   * #### Notes
   * The index will be clamped to the bounds of the tabs.
   *
   * If the title is already added to the tab bar, it will be moved.
   */
  insertTab(index, value) {
    this._releaseMouse();
    let title = Private$7.asTitle(value);
    let i = this._titles.indexOf(title);
    let j = Math.max(0, Math.min(index, this._titles.length));
    if (i === -1) {
      import_algorithm2.ArrayExt.insert(this._titles, j, title);
      title.changed.connect(this._onTitleChanged, this);
      this.update();
      this._adjustCurrentForInsert(j, title);
      return title;
    }
    if (j === this._titles.length) {
      j--;
    }
    if (i === j) {
      return title;
    }
    import_algorithm2.ArrayExt.move(this._titles, i, j);
    this.update();
    this._adjustCurrentForMove(i, j);
    return title;
  }
  /**
   * Remove a tab from the tab bar.
   *
   * @param title - The title for the tab to remove.
   *
   * #### Notes
   * This is a no-op if the title is not in the tab bar.
   */
  removeTab(title) {
    this.removeTabAt(this._titles.indexOf(title));
  }
  /**
   * Remove the tab at a given index from the tab bar.
   *
   * @param index - The index of the tab to remove.
   *
   * #### Notes
   * This is a no-op if the index is out of range.
   */
  removeTabAt(index) {
    let indexIsValid = index >= 0 && index < this._titles.length;
    if (this._tabSizeFrozen) {
      if (indexIsValid) {
        let tabs = this.contentNode.children;
        this._frozenTabWidths = [];
        for (let i = 0, n = tabs.length; i < n; ++i) {
          if (i !== index) {
            this._frozenTabWidths.push(tabs[i].offsetWidth);
          }
        }
      } else {
        this._frozenTabWidths = null;
      }
    }
    this._releaseMouse();
    let title = import_algorithm2.ArrayExt.removeAt(this._titles, index);
    if (!title) {
      return;
    }
    title.changed.disconnect(this._onTitleChanged, this);
    if (title === this._previousTitle) {
      this._previousTitle = null;
    }
    this.update();
    this._adjustCurrentForRemove(index, title);
  }
  /**
   * Remove all tabs from the tab bar.
   */
  clearTabs() {
    if (this._titles.length === 0) {
      return;
    }
    this._releaseMouse();
    for (let title of this._titles) {
      title.changed.disconnect(this._onTitleChanged, this);
    }
    let pi = this.currentIndex;
    let pt = this.currentTitle;
    this._currentIndex = -1;
    this._previousTitle = null;
    this._titles.length = 0;
    this.update();
    if (pi === -1) {
      return;
    }
    this._currentChanged.emit({
      previousIndex: pi,
      previousTitle: pt,
      currentIndex: -1,
      currentTitle: null
    });
  }
  /**
   * Release the mouse and restore the non-dragged tab positions.
   *
   * #### Notes
   * This will cause the tab bar to stop handling mouse events and to
   * restore the tabs to their non-dragged positions.
   */
  releaseMouse() {
    this._releaseMouse();
  }
  /**
   * Handle the DOM events for the tab bar.
   *
   * @param event - The DOM event sent to the tab bar.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the tab bar's DOM node.
   *
   * This should not be called directly by user code.
   */
  handleEvent(event) {
    switch (event.type) {
      case "pointerdown":
        this._evtPointerDown(event);
        break;
      case "pointermove":
        this._evtPointerMove(event);
        break;
      case "pointerup":
        this._evtPointerUp(event);
        break;
      case "pointerleave":
        this._evtPointerLeave(event);
        break;
      case "dblclick":
        this._evtDblClick(event);
        break;
      case "keydown":
        event.eventPhase === Event.CAPTURING_PHASE ? this._evtKeyDownCapturing(event) : this._evtKeyDown(event);
        break;
      case "contextmenu":
        event.preventDefault();
        event.stopPropagation();
        break;
    }
  }
  /**
   * A message handler invoked on a `'before-attach'` message.
   */
  onBeforeAttach(msg) {
    this.node.addEventListener("pointerdown", this);
    this.node.addEventListener("pointerleave", this);
    this.node.addEventListener("dblclick", this);
    this.node.addEventListener("keydown", this);
  }
  /**
   * A message handler invoked on an `'after-detach'` message.
   */
  onAfterDetach(msg) {
    this.node.removeEventListener("pointerdown", this);
    this.node.removeEventListener("pointerleave", this);
    this.node.removeEventListener("dblclick", this);
    this.node.removeEventListener("keydown", this);
    this._clearUnfreezeTransitionState();
    this._clearTabSizeFreezeState();
    this._releaseMouse();
  }
  /**
   * A message handler invoked on an `'update-request'` message.
   */
  onUpdateRequest(msg) {
    var _a;
    let titles = this._titles;
    let renderer = this.renderer;
    let currentTitle = this.currentTitle;
    let content = new Array(titles.length);
    const tabHandlingTabindex = (_a = this._getCurrentTabindex()) !== null && _a !== void 0 ? _a : this._currentIndex > -1 ? this._currentIndex : 0;
    for (let i = 0, n = titles.length; i < n; ++i) {
      let title = titles[i];
      let current = title === currentTitle;
      let zIndex = current ? n : n - i - 1;
      let tabIndex = tabHandlingTabindex === i ? 0 : -1;
      content[i] = renderer.renderTab({ title, current, zIndex, tabIndex });
    }
    import_virtualdom.VirtualDOM.render(content, this.contentNode);
    if (this._tabSizeFrozen) {
      let tabs = this.contentNode.children;
      if (this._frozenTabWidths && this._frozenTabWidths.length === tabs.length) {
        for (let i = 0, n = tabs.length; i < n; ++i) {
          this._setFrozenTabSize(tabs[i], this._frozenTabWidths[i]);
        }
        this._frozenTabWidths = null;
      } else {
        this._frozenTabWidths = null;
        for (let i = 0, n = tabs.length; i < n; ++i) {
          let tab = tabs[i];
          this._setFrozenTabSize(tab, tab.offsetWidth);
        }
      }
    }
  }
  /**
   * Get the index of the tab which handles tabindex="0".
   * If the add button handles tabindex="0", -1 is returned.
   * If none of the previous handles tabindex="0", null is returned.
   */
  _getCurrentTabindex() {
    let index = null;
    const elemTabindex = this.contentNode.querySelector('li[tabindex="0"]');
    if (elemTabindex) {
      index = [...this.contentNode.children].indexOf(elemTabindex);
    } else if (this._addButtonEnabled && this.addButtonNode.getAttribute("tabindex") === "0") {
      index = -1;
    }
    return index;
  }
  /**
   * Handle the `'dblclick'` event for the tab bar.
   */
  _evtDblClick(event) {
    if (!this.titlesEditable) {
      return;
    }
    let tabs = this.contentNode.children;
    let index = import_algorithm2.ArrayExt.findFirstIndex(tabs, (tab) => {
      return import_domutils2.ElementExt.hitTest(tab, event.clientX, event.clientY);
    });
    if (index === -1) {
      return;
    }
    let title = this.titles[index];
    let label = tabs[index].querySelector(".lm-TabBar-tabLabel");
    if (label && label.contains(event.target)) {
      let value = title.label || "";
      let oldValue = label.innerHTML;
      label.innerHTML = "";
      let input = document.createElement("input");
      input.classList.add("lm-TabBar-tabInput");
      input.value = value;
      label.appendChild(input);
      let onblur = () => {
        input.removeEventListener("blur", onblur);
        label.innerHTML = oldValue;
        this.node.addEventListener("keydown", this);
      };
      input.addEventListener("dblclick", (event2) => event2.stopPropagation());
      input.addEventListener("blur", onblur);
      input.addEventListener("keydown", (event2) => {
        if (event2.key === "Enter") {
          if (input.value !== "") {
            title.label = title.caption = input.value;
          }
          onblur();
        } else if (event2.key === "Escape") {
          onblur();
        }
      });
      this.node.removeEventListener("keydown", this);
      input.select();
      input.focus();
      if (label.children.length > 0) {
        label.children[0].focus();
      }
    }
  }
  /**
   * Handle the `'keydown'` event for the tab bar at capturing phase.
   */
  _evtKeyDownCapturing(event) {
    if (event.eventPhase !== Event.CAPTURING_PHASE) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      this._releaseMouse();
    }
  }
  /**
   * Handle the `'keydown'` event for the tab bar at target phase.
   */
  _evtKeyDown(event) {
    var _a, _b, _c;
    if (event.key === "Tab" || event.eventPhase === Event.CAPTURING_PHASE) {
      return;
    }
    if (event.key === "Enter" || event.key === "Spacebar" || event.key === " ") {
      const focusedElement = document.activeElement;
      if (this.addButtonEnabled && this.addButtonNode.contains(focusedElement)) {
        event.preventDefault();
        event.stopPropagation();
        this._addRequested.emit();
      } else {
        const index = import_algorithm2.ArrayExt.findFirstIndex(this.contentNode.children, (tab) => tab.contains(focusedElement));
        if (index >= 0) {
          event.preventDefault();
          event.stopPropagation();
          this.currentIndex = index;
        }
      }
    } else if (ARROW_KEYS.includes(event.key)) {
      const focusable = [...this.contentNode.children];
      if (this.addButtonEnabled) {
        focusable.push(this.addButtonNode);
      }
      if (focusable.length <= 1) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      let focusedIndex = focusable.indexOf(document.activeElement);
      if (focusedIndex === -1) {
        focusedIndex = this._currentIndex;
      }
      let nextFocused;
      if (event.key === "ArrowRight" && this._orientation === "horizontal" || event.key === "ArrowDown" && this._orientation === "vertical") {
        nextFocused = (_a = focusable[focusedIndex + 1]) !== null && _a !== void 0 ? _a : focusable[0];
      } else if (event.key === "ArrowLeft" && this._orientation === "horizontal" || event.key === "ArrowUp" && this._orientation === "vertical") {
        nextFocused = (_b = focusable[focusedIndex - 1]) !== null && _b !== void 0 ? _b : focusable[focusable.length - 1];
      } else if (event.key === "Home") {
        nextFocused = focusable[0];
      } else if (event.key === "End") {
        nextFocused = focusable[focusable.length - 1];
      }
      if (nextFocused) {
        (_c = focusable[focusedIndex]) === null || _c === void 0 ? void 0 : _c.setAttribute("tabindex", "-1");
        nextFocused === null || nextFocused === void 0 ? void 0 : nextFocused.setAttribute("tabindex", "0");
        nextFocused.focus();
      }
    }
  }
  /**
   * Handle the `'pointerdown'` event for the tab bar.
   */
  _evtPointerDown(event) {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    if (this._dragData) {
      return;
    }
    if (event.target.classList.contains("lm-TabBar-tabInput")) {
      return;
    }
    let addButtonClicked = this.addButtonEnabled && this.addButtonNode.contains(event.target);
    let tabs = this.contentNode.children;
    let index = import_algorithm2.ArrayExt.findFirstIndex(tabs, (tab) => {
      return import_domutils2.ElementExt.hitTest(tab, event.clientX, event.clientY);
    });
    if (index === -1 && !addButtonClicked) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this._dragData = {
      tab: tabs[index],
      index,
      pressX: event.clientX,
      pressY: event.clientY,
      tabPos: -1,
      tabSize: -1,
      tabPressPos: -1,
      targetIndex: -1,
      tabLayout: null,
      contentRect: null,
      override: null,
      dragActive: false,
      dragAborted: false,
      detachRequested: false
    };
    this.document.addEventListener("pointerup", this, true);
    if (event.button === 1 || addButtonClicked) {
      return;
    }
    let icon = tabs[index].querySelector(this.renderer.closeIconSelector);
    if (icon && icon.contains(event.target)) {
      return;
    }
    if (this.tabsMovable) {
      this.document.addEventListener("pointermove", this, true);
      this.document.addEventListener("keydown", this, true);
      this.document.addEventListener("contextmenu", this, true);
    }
    if (this.allowDeselect && this.currentIndex === index) {
      this.currentIndex = -1;
    } else {
      this.currentIndex = index;
    }
    if (this.currentIndex === -1) {
      return;
    }
    this._tabActivateRequested.emit({
      index: this.currentIndex,
      title: this.currentTitle
    });
  }
  /**
   * Handle the `'pointermove'` event for the tab bar.
   */
  _evtPointerMove(event) {
    let data = this._dragData;
    if (!data) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    let tabs = this.contentNode.children;
    if (!data.dragActive && !Private$7.dragExceeded(data, event)) {
      return;
    }
    if (!data.dragActive) {
      let tabRect = data.tab.getBoundingClientRect();
      if (this._orientation === "horizontal") {
        data.tabPos = data.tab.offsetLeft;
        data.tabSize = tabRect.width;
        data.tabPressPos = data.pressX - tabRect.left;
      } else {
        data.tabPos = data.tab.offsetTop;
        data.tabSize = tabRect.height;
        data.tabPressPos = data.pressY - tabRect.top;
      }
      data.tabPressOffset = {
        x: data.pressX - tabRect.left,
        y: data.pressY - tabRect.top
      };
      data.tabLayout = Private$7.snapTabLayout(tabs, this._orientation);
      data.contentRect = this.contentNode.getBoundingClientRect();
      data.override = Drag.overrideCursor("default");
      data.tab.classList.add("lm-mod-dragging");
      this.addClass("lm-mod-dragging");
      data.dragActive = true;
    }
    if (!data.detachRequested && Private$7.detachExceeded(data, event)) {
      data.detachRequested = true;
      let index = data.index;
      let clientX = event.clientX;
      let clientY = event.clientY;
      let tab = tabs[index];
      let title = this._titles[index];
      this._tabDetachRequested.emit({
        index,
        title,
        tab,
        clientX,
        clientY,
        offset: data.tabPressOffset
      });
      if (data.dragAborted) {
        return;
      }
    }
    Private$7.layoutTabs(tabs, data, event, this._orientation);
  }
  /**
   * Handle the `'pointerup'` event for the document.
   */
  _evtPointerUp(event) {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    const data = this._dragData;
    if (!data) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.document.removeEventListener("pointermove", this, true);
    this.document.removeEventListener("pointerup", this, true);
    this.document.removeEventListener("keydown", this, true);
    this.document.removeEventListener("contextmenu", this, true);
    if (!data.dragActive) {
      this._dragData = null;
      let addButtonClicked = this.addButtonEnabled && this.addButtonNode.contains(event.target);
      if (addButtonClicked) {
        this._addRequested.emit(void 0);
        return;
      }
      let tabs = this.contentNode.children;
      let index = import_algorithm2.ArrayExt.findFirstIndex(tabs, (tab) => {
        return import_domutils2.ElementExt.hitTest(tab, event.clientX, event.clientY);
      });
      if (index !== data.index) {
        return;
      }
      let title = this._titles[index];
      if (!title.closable) {
        return;
      }
      if (event.button === 1) {
        this._tabCloseRequested.emit({ index, title });
        return;
      }
      let icon = tabs[index].querySelector(this.renderer.closeIconSelector);
      if (icon && icon.contains(event.target)) {
        this._tabSizeFrozen = true;
        this._tabCloseRequested.emit({ index, title });
        return;
      }
      return;
    }
    if (event.button !== 0) {
      return;
    }
    Private$7.finalizeTabPosition(data, this._orientation);
    data.tab.classList.remove("lm-mod-dragging");
    let duration = Private$7.parseTransitionDuration(data.tab);
    setTimeout(() => {
      if (data.dragAborted) {
        return;
      }
      this._dragData = null;
      Private$7.resetTabPositions(this.contentNode.children, this._orientation);
      data.override.dispose();
      this.removeClass("lm-mod-dragging");
      let i = data.index;
      let j = data.targetIndex;
      if (j === -1 || i === j) {
        return;
      }
      import_algorithm2.ArrayExt.move(this._titles, i, j);
      this._adjustCurrentForMove(i, j);
      this._tabMoved.emit({
        fromIndex: i,
        toIndex: j,
        title: this._titles[j]
      });
      import_messaging.MessageLoop.sendMessage(this, Widget.Msg.UpdateRequest);
    }, duration);
  }
  /**
   * Release the mouse and restore the non-dragged tab positions.
   */
  _releaseMouse() {
    let data = this._dragData;
    if (!data) {
      return;
    }
    this._dragData = null;
    this.document.removeEventListener("pointermove", this, true);
    this.document.removeEventListener("pointerup", this, true);
    this.document.removeEventListener("keydown", this, true);
    this.document.removeEventListener("contextmenu", this, true);
    data.dragAborted = true;
    if (!data.dragActive) {
      return;
    }
    Private$7.resetTabPositions(this.contentNode.children, this._orientation);
    data.override.dispose();
    data.tab.classList.remove("lm-mod-dragging");
    this.removeClass("lm-mod-dragging");
  }
  /**
   * Adjust the current index for a tab insert operation.
   *
   * This method accounts for the tab bar's insertion behavior when
   * adjusting the current index and emitting the changed signal.
   */
  _adjustCurrentForInsert(i, title) {
    let ct = this.currentTitle;
    let ci = this._currentIndex;
    let bh = this.insertBehavior;
    if (bh === "select-tab" || bh === "select-tab-if-needed" && ci === -1) {
      this._currentIndex = i;
      this._previousTitle = ct;
      this._currentChanged.emit({
        previousIndex: ci,
        previousTitle: ct,
        currentIndex: i,
        currentTitle: title
      });
      return;
    }
    if (ci >= i) {
      this._currentIndex++;
    }
  }
  /**
   * Adjust the current index for a tab move operation.
   *
   * This method will not cause the actual current tab to change.
   * It silently adjusts the index to account for the given move.
   */
  _adjustCurrentForMove(i, j) {
    if (this._currentIndex === i) {
      this._currentIndex = j;
    } else if (this._currentIndex < i && this._currentIndex >= j) {
      this._currentIndex++;
    } else if (this._currentIndex > i && this._currentIndex <= j) {
      this._currentIndex--;
    }
  }
  /**
   * Adjust the current index for a tab remove operation.
   *
   * This method accounts for the tab bar's remove behavior when
   * adjusting the current index and emitting the changed signal.
   */
  _adjustCurrentForRemove(i, title) {
    let ci = this._currentIndex;
    let bh = this.removeBehavior;
    if (ci !== i) {
      if (ci > i) {
        this._currentIndex--;
      }
      return;
    }
    if (this._titles.length === 0) {
      this._currentIndex = -1;
      this._currentChanged.emit({
        previousIndex: i,
        previousTitle: title,
        currentIndex: -1,
        currentTitle: null
      });
      return;
    }
    if (bh === "select-tab-after") {
      this._currentIndex = Math.min(i, this._titles.length - 1);
      this._currentChanged.emit({
        previousIndex: i,
        previousTitle: title,
        currentIndex: this._currentIndex,
        currentTitle: this.currentTitle
      });
      return;
    }
    if (bh === "select-tab-before") {
      this._currentIndex = Math.max(0, i - 1);
      this._currentChanged.emit({
        previousIndex: i,
        previousTitle: title,
        currentIndex: this._currentIndex,
        currentTitle: this.currentTitle
      });
      return;
    }
    if (bh === "select-previous-tab") {
      if (this._previousTitle) {
        this._currentIndex = this._titles.indexOf(this._previousTitle);
        this._previousTitle = null;
      } else {
        this._currentIndex = Math.min(i, this._titles.length - 1);
      }
      this._currentChanged.emit({
        previousIndex: i,
        previousTitle: title,
        currentIndex: this._currentIndex,
        currentTitle: this.currentTitle
      });
      return;
    }
    this._currentIndex = -1;
    this._currentChanged.emit({
      previousIndex: i,
      previousTitle: title,
      currentIndex: -1,
      currentTitle: null
    });
  }
  /**
   * Handle the `changed` signal of a title object.
   */
  _onTitleChanged(sender) {
    this.update();
  }
  /**
   * Handle the `'pointerleave'` event for the tab bar.
   *
   * This restores the natural tab sizing after tabs were frozen
   * due to a close-icon click.
   */
  _evtPointerLeave(event) {
    if (!this._tabSizeFrozen) {
      return;
    }
    this._tabSizeFrozen = false;
    this._frozenTabWidths = null;
    this._unfreezeRunID++;
    let runID = this._unfreezeRunID;
    this._clearUnfreezeTransitionState();
    this.addClass("lm-mod-unfreezing");
    let tabs = this.contentNode.children;
    for (let i = 0, n = tabs.length; i < n; ++i) {
      let tab = tabs[i];
      tab.style.width = "";
      tab.style.flexBasis = "";
    }
    if (tabs.length === 0) {
      this.removeClass("lm-mod-unfreezing");
    } else {
      let onTransitionDone = (event2) => {
        let propertyName = event2.propertyName;
        if (propertyName === "width" || propertyName === "flex-basis") {
          this._finalizeUnfreezeRun(runID);
        }
      };
      this._unfreezeTransitionListener = onTransitionDone;
      this.node.addEventListener("transitionend", onTransitionDone);
      this.node.addEventListener("transitioncancel", onTransitionDone);
      this._unfreezeFallbackTimerID = window.setTimeout(() => {
        this._finalizeUnfreezeRun(runID);
      }, 2e3);
    }
    this.update();
  }
  /**
   * Apply a frozen size to a tab.
   *
   * The width is mirrored to `flex-basis` so frozen sizing works even when
   * themes define tab sizing through flex rules.
   */
  _setFrozenTabSize(tab, width) {
    let size = `${width}px`;
    tab.style.width = size;
    tab.style.flexBasis = size;
  }
  /**
   * Finish an in-flight unfreeze transition run.
   */
  _finalizeUnfreezeRun(runID) {
    if (runID !== this._unfreezeRunID) {
      return;
    }
    this._clearUnfreezeTransitionState();
    this.removeClass("lm-mod-unfreezing");
  }
  /**
   * Remove unfreeze listeners and timers.
   */
  _clearUnfreezeTransitionState() {
    if (this._unfreezeTransitionListener) {
      this.node.removeEventListener("transitionend", this._unfreezeTransitionListener);
      this.node.removeEventListener("transitioncancel", this._unfreezeTransitionListener);
      this._unfreezeTransitionListener = null;
    }
    if (this._unfreezeFallbackTimerID !== 0) {
      clearTimeout(this._unfreezeFallbackTimerID);
      this._unfreezeFallbackTimerID = 0;
    }
  }
  /**
   * Clear transient tab-size freeze state and styles.
   */
  _clearTabSizeFreezeState() {
    this._tabSizeFrozen = false;
    this._frozenTabWidths = null;
    this.removeClass("lm-mod-unfreezing");
    let tabs = this.contentNode.children;
    for (let i = 0, n = tabs.length; i < n; ++i) {
      let tab = tabs[i];
      tab.style.width = "";
      tab.style.flexBasis = "";
    }
  }
};
(function(TabBar2) {
  class Renderer {
    constructor() {
      this.closeIconSelector = ".lm-TabBar-tabCloseIcon";
      this._tabID = 0;
      this._tabKeys = /* @__PURE__ */ new WeakMap();
      this._uuid = ++Renderer._nInstance;
    }
    /**
     * Render the virtual element for a tab.
     *
     * @param data - The data to use for rendering the tab.
     *
     * @returns A virtual element representing the tab.
     */
    renderTab(data) {
      let title = data.title.caption;
      let key = this.createTabKey(data);
      let id = key;
      let style = this.createTabStyle(data);
      let className = this.createTabClass(data);
      let dataset = this.createTabDataset(data);
      let aria = this.createTabARIA(data);
      if (data.title.closable) {
        return import_virtualdom.h.li({ id, key, className, title, style, dataset, ...aria }, this.renderIcon(data), this.renderLabel(data), this.renderCloseIcon(data));
      } else {
        return import_virtualdom.h.li({ id, key, className, title, style, dataset, ...aria }, this.renderIcon(data), this.renderLabel(data));
      }
    }
    /**
     * Render the icon element for a tab.
     *
     * @param data - The data to use for rendering the tab.
     *
     * @returns A virtual element representing the tab icon.
     */
    renderIcon(data) {
      const { title } = data;
      let className = this.createIconClass(data);
      return import_virtualdom.h.div({ className }, title.icon, title.iconLabel);
    }
    /**
     * Render the label element for a tab.
     *
     * @param data - The data to use for rendering the tab.
     *
     * @returns A virtual element representing the tab label.
     */
    renderLabel(data) {
      return import_virtualdom.h.div({ className: "lm-TabBar-tabLabel" }, data.title.label);
    }
    /**
     * Render the close icon element for a tab.
     *
     * @param data - The data to use for rendering the tab.
     *
     * @returns A virtual element representing the tab close icon.
     */
    renderCloseIcon(data) {
      return import_virtualdom.h.div({ className: "lm-TabBar-tabCloseIcon" });
    }
    /**
     * Create a unique render key for the tab.
     *
     * @param data - The data to use for the tab.
     *
     * @returns The unique render key for the tab.
     *
     * #### Notes
     * This method caches the key against the tab title the first time
     * the key is generated. This enables efficient rendering of moved
     * tabs and avoids subtle hover style artifacts.
     */
    createTabKey(data) {
      let key = this._tabKeys.get(data.title);
      if (key === void 0) {
        key = `tab-key-${this._uuid}-${this._tabID++}`;
        this._tabKeys.set(data.title, key);
      }
      return key;
    }
    /**
     * Create the inline style object for a tab.
     *
     * @param data - The data to use for the tab.
     *
     * @returns The inline style data for the tab.
     */
    createTabStyle(data) {
      return { zIndex: `${data.zIndex}` };
    }
    /**
     * Create the class name for the tab.
     *
     * @param data - The data to use for the tab.
     *
     * @returns The full class name for the tab.
     */
    createTabClass(data) {
      let name = "lm-TabBar-tab";
      if (data.title.className) {
        name += ` ${data.title.className}`;
      }
      if (data.title.closable) {
        name += " lm-mod-closable";
      }
      if (data.current) {
        name += " lm-mod-current";
      }
      return name;
    }
    /**
     * Create the dataset for a tab.
     *
     * @param data - The data to use for the tab.
     *
     * @returns The dataset for the tab.
     */
    createTabDataset(data) {
      return data.title.dataset;
    }
    /**
     * Create the ARIA attributes for a tab.
     *
     * @param data - The data to use for the tab.
     *
     * @returns The ARIA attributes for the tab.
     */
    createTabARIA(data) {
      var _a;
      return {
        role: "tab",
        "aria-selected": data.current.toString(),
        tabindex: `${(_a = data.tabIndex) !== null && _a !== void 0 ? _a : "-1"}`
      };
    }
    /**
     * Create the class name for the tab icon.
     *
     * @param data - The data to use for the tab.
     *
     * @returns The full class name for the tab icon.
     */
    createIconClass(data) {
      let name = "lm-TabBar-tabIcon";
      let extra = data.title.iconClass;
      return extra ? `${name} ${extra}` : name;
    }
  }
  Renderer._nInstance = 0;
  TabBar2.Renderer = Renderer;
  TabBar2.defaultRenderer = new Renderer();
  TabBar2.addButtonSelector = ".lm-TabBar-addButton";
})(TabBar || (TabBar = {}));
var Private$7;
(function(Private6) {
  Private6.DRAG_THRESHOLD = 5;
  Private6.DETACH_THRESHOLD = 20;
  function createNode() {
    let node = document.createElement("div");
    let content = document.createElement("ul");
    content.setAttribute("role", "tablist");
    content.className = "lm-TabBar-content";
    node.appendChild(content);
    let add = document.createElement("div");
    add.className = "lm-TabBar-addButton lm-mod-hidden";
    add.setAttribute("tabindex", "-1");
    add.setAttribute("role", "button");
    node.appendChild(add);
    return node;
  }
  Private6.createNode = createNode;
  function asTitle(value) {
    return value instanceof Title ? value : new Title(value);
  }
  Private6.asTitle = asTitle;
  function parseTransitionDuration(tab) {
    let style = window.getComputedStyle(tab);
    return 1e3 * (parseFloat(style.transitionDuration) || 0);
  }
  Private6.parseTransitionDuration = parseTransitionDuration;
  function snapTabLayout(tabs, orientation) {
    let layout = new Array(tabs.length);
    for (let i = 0, n = tabs.length; i < n; ++i) {
      let node = tabs[i];
      let style = window.getComputedStyle(node);
      if (orientation === "horizontal") {
        layout[i] = {
          pos: node.offsetLeft,
          size: node.offsetWidth,
          margin: parseFloat(style.marginLeft) || 0
        };
      } else {
        layout[i] = {
          pos: node.offsetTop,
          size: node.offsetHeight,
          margin: parseFloat(style.marginTop) || 0
        };
      }
    }
    return layout;
  }
  Private6.snapTabLayout = snapTabLayout;
  function dragExceeded(data, event) {
    let dx = Math.abs(event.clientX - data.pressX);
    let dy = Math.abs(event.clientY - data.pressY);
    return dx >= Private6.DRAG_THRESHOLD || dy >= Private6.DRAG_THRESHOLD;
  }
  Private6.dragExceeded = dragExceeded;
  function detachExceeded(data, event) {
    let rect = data.contentRect;
    return event.clientX < rect.left - Private6.DETACH_THRESHOLD || event.clientX >= rect.right + Private6.DETACH_THRESHOLD || event.clientY < rect.top - Private6.DETACH_THRESHOLD || event.clientY >= rect.bottom + Private6.DETACH_THRESHOLD;
  }
  Private6.detachExceeded = detachExceeded;
  function layoutTabs(tabs, data, event, orientation) {
    let pressPos;
    let localPos;
    let clientPos;
    let clientSize;
    if (orientation === "horizontal") {
      pressPos = data.pressX;
      localPos = event.clientX - data.contentRect.left;
      clientPos = event.clientX;
      clientSize = data.contentRect.width;
    } else {
      pressPos = data.pressY;
      localPos = event.clientY - data.contentRect.top;
      clientPos = event.clientY;
      clientSize = data.contentRect.height;
    }
    let targetIndex = data.index;
    let targetPos = localPos - data.tabPressPos;
    let targetEnd = targetPos + data.tabSize;
    for (let i = 0, n = tabs.length; i < n; ++i) {
      let pxPos;
      let layout = data.tabLayout[i];
      let threshold = layout.pos + (layout.size >> 1);
      if (i < data.index && targetPos < threshold) {
        pxPos = `${data.tabSize + data.tabLayout[i + 1].margin}px`;
        targetIndex = Math.min(targetIndex, i);
      } else if (i > data.index && targetEnd > threshold) {
        pxPos = `${-data.tabSize - layout.margin}px`;
        targetIndex = Math.max(targetIndex, i);
      } else if (i === data.index) {
        let ideal = clientPos - pressPos;
        let limit = clientSize - (data.tabPos + data.tabSize);
        pxPos = `${Math.max(-data.tabPos, Math.min(ideal, limit))}px`;
      } else {
        pxPos = "";
      }
      if (orientation === "horizontal") {
        tabs[i].style.left = pxPos;
      } else {
        tabs[i].style.top = pxPos;
      }
    }
    data.targetIndex = targetIndex;
  }
  Private6.layoutTabs = layoutTabs;
  function finalizeTabPosition(data, orientation) {
    let clientSize;
    if (orientation === "horizontal") {
      clientSize = data.contentRect.width;
    } else {
      clientSize = data.contentRect.height;
    }
    let ideal;
    if (data.targetIndex === data.index) {
      ideal = 0;
    } else if (data.targetIndex > data.index) {
      let tgt = data.tabLayout[data.targetIndex];
      ideal = tgt.pos + tgt.size - data.tabSize - data.tabPos;
    } else {
      let tgt = data.tabLayout[data.targetIndex];
      ideal = tgt.pos - data.tabPos;
    }
    let limit = clientSize - (data.tabPos + data.tabSize);
    let final = Math.max(-data.tabPos, Math.min(ideal, limit));
    if (orientation === "horizontal") {
      data.tab.style.left = `${final}px`;
    } else {
      data.tab.style.top = `${final}px`;
    }
  }
  Private6.finalizeTabPosition = finalizeTabPosition;
  function resetTabPositions(tabs, orientation) {
    for (const tab of tabs) {
      if (orientation === "horizontal") {
        tab.style.left = "";
      } else {
        tab.style.top = "";
      }
    }
  }
  Private6.resetTabPositions = resetTabPositions;
})(Private$7 || (Private$7 = {}));
var DockLayout = class extends Layout {
  /**
   * Construct a new dock layout.
   *
   * @param options - The options for initializing the layout.
   */
  constructor(options) {
    super();
    this._spacing = 4;
    this._dirty = false;
    this._root = null;
    this._box = null;
    this._items = /* @__PURE__ */ new Map();
    this.renderer = options.renderer;
    if (options.spacing !== void 0) {
      this._spacing = Utils$1.clampDimension(options.spacing);
    }
    this._document = options.document || document;
    this._hiddenMode = options.hiddenMode !== void 0 ? options.hiddenMode : Widget.HiddenMode.Display;
  }
  /**
   * Dispose of the resources held by the layout.
   *
   * #### Notes
   * This will clear and dispose all widgets in the layout.
   */
  dispose() {
    let widgets = this[Symbol.iterator]();
    this._items.forEach((item) => {
      item.dispose();
    });
    this._box = null;
    this._root = null;
    this._items.clear();
    for (const widget of widgets) {
      widget.dispose();
    }
    super.dispose();
  }
  /**
   * The method for hiding child widgets.
   *
   * #### Notes
   * If there is only one child widget, `Display` hiding mode will be used
   * regardless of this setting.
   */
  get hiddenMode() {
    return this._hiddenMode;
  }
  set hiddenMode(v) {
    if (this._hiddenMode === v) {
      return;
    }
    this._hiddenMode = v;
    for (const bar of this.tabBars()) {
      if (bar.titles.length > 1) {
        for (const title of bar.titles) {
          title.owner.hiddenMode = this._hiddenMode;
        }
      }
    }
  }
  /**
   * Get the inter-element spacing for the dock layout.
   */
  get spacing() {
    return this._spacing;
  }
  /**
   * Set the inter-element spacing for the dock layout.
   */
  set spacing(value) {
    value = Utils$1.clampDimension(value);
    if (this._spacing === value) {
      return;
    }
    this._spacing = value;
    if (!this.parent) {
      return;
    }
    this.parent.fit();
  }
  /**
   * Whether the dock layout is empty.
   */
  get isEmpty() {
    return this._root === null;
  }
  /**
   * Create an iterator over all widgets in the layout.
   *
   * @returns A new iterator over the widgets in the layout.
   *
   * #### Notes
   * This iterator includes the generated tab bars.
   */
  [Symbol.iterator]() {
    return this._root ? this._root.iterAllWidgets() : (0, import_algorithm2.empty)();
  }
  /**
   * Create an iterator over the user widgets in the layout.
   *
   * @returns A new iterator over the user widgets in the layout.
   *
   * #### Notes
   * This iterator does not include the generated tab bars.
   */
  widgets() {
    return this._root ? this._root.iterUserWidgets() : (0, import_algorithm2.empty)();
  }
  /**
   * Create an iterator over the selected widgets in the layout.
   *
   * @returns A new iterator over the selected user widgets.
   *
   * #### Notes
   * This iterator yields the widgets corresponding to the current tab
   * of each tab bar in the layout.
   */
  selectedWidgets() {
    return this._root ? this._root.iterSelectedWidgets() : (0, import_algorithm2.empty)();
  }
  /**
   * Create an iterator over the tab bars in the layout.
   *
   * @returns A new iterator over the tab bars in the layout.
   *
   * #### Notes
   * This iterator does not include the user widgets.
   */
  tabBars() {
    return this._root ? this._root.iterTabBars() : (0, import_algorithm2.empty)();
  }
  /**
   * Create an iterator over the handles in the layout.
   *
   * @returns A new iterator over the handles in the layout.
   */
  handles() {
    return this._root ? this._root.iterHandles() : (0, import_algorithm2.empty)();
  }
  /**
   * Move a handle to the given offset position.
   *
   * @param handle - The handle to move.
   *
   * @param offsetX - The desired offset X position of the handle.
   *
   * @param offsetY - The desired offset Y position of the handle.
   *
   * #### Notes
   * If the given handle is not contained in the layout, this is no-op.
   *
   * The handle will be moved as close as possible to the desired
   * position without violating any of the layout constraints.
   *
   * Only one of the coordinates is used depending on the orientation
   * of the handle. This method accepts both coordinates to make it
   * easy to invoke from a mouse move event without needing to know
   * the handle orientation.
   */
  moveHandle(handle, offsetX, offsetY) {
    let hidden = handle.classList.contains("lm-mod-hidden");
    if (!this._root || hidden) {
      return;
    }
    let data = this._root.findSplitNode(handle);
    if (!data) {
      return;
    }
    let delta;
    if (data.node.orientation === "horizontal") {
      delta = offsetX - handle.offsetLeft;
    } else {
      delta = offsetY - handle.offsetTop;
    }
    if (delta === 0) {
      return;
    }
    data.node.holdSizes();
    BoxEngine.adjust(data.node.sizers, data.index, delta);
    if (this.parent) {
      this.parent.update();
    }
  }
  /**
   * Save the current configuration of the dock layout.
   *
   * @returns A new config object for the current layout state.
   *
   * #### Notes
   * The return value can be provided to the `restoreLayout` method
   * in order to restore the layout to its current configuration.
   */
  saveLayout() {
    if (!this._root) {
      return { main: null };
    }
    this._root.holdAllSizes();
    return { main: this._root.createConfig() };
  }
  /**
   * Restore the layout to a previously saved configuration.
   *
   * @param config - The layout configuration to restore.
   *
   * #### Notes
   * Widgets which currently belong to the layout but which are not
   * contained in the config will be unparented.
   */
  restoreLayout(config) {
    let widgetSet = /* @__PURE__ */ new Set();
    let mainConfig;
    if (config.main) {
      mainConfig = Private$6.normalizeAreaConfig(config.main, widgetSet);
    } else {
      mainConfig = null;
    }
    let oldWidgets = this.widgets();
    let oldTabBars = this.tabBars();
    let oldHandles = this.handles();
    this._root = null;
    for (const widget of oldWidgets) {
      if (!widgetSet.has(widget)) {
        widget.parent = null;
      }
    }
    for (const tabBar of oldTabBars) {
      tabBar.dispose();
    }
    for (const handle of oldHandles) {
      if (handle.parentNode) {
        handle.parentNode.removeChild(handle);
      }
    }
    for (const widget of widgetSet) {
      widget.parent = this.parent;
    }
    if (mainConfig) {
      this._root = Private$6.realizeAreaConfig(mainConfig, {
        // Ignoring optional `document` argument as we must reuse `this._document`
        createTabBar: (document2) => this._createTabBar(),
        createHandle: () => this._createHandle()
      }, this._document);
    } else {
      this._root = null;
    }
    if (!this.parent) {
      return;
    }
    widgetSet.forEach((widget) => {
      this.attachWidget(widget);
    });
    this.parent.fit();
  }
  /**
   * Add a widget to the dock layout.
   *
   * @param widget - The widget to add to the dock layout.
   *
   * @param options - The additional options for adding the widget.
   *
   * #### Notes
   * The widget will be moved if it is already contained in the layout.
   *
   * An error will be thrown if the reference widget is invalid.
   */
  addWidget(widget, options = {}) {
    let ref = options.ref || null;
    let mode = options.mode || "tab-after";
    let refNode = null;
    if (this._root && ref) {
      refNode = this._root.findTabNode(ref);
    }
    if (ref && !refNode) {
      throw new Error("Reference widget is not in the layout.");
    }
    widget.parent = this.parent;
    switch (mode) {
      case "tab-after":
        this._insertTab(widget, ref, refNode, true);
        break;
      case "tab-before":
        this._insertTab(widget, ref, refNode, false);
        break;
      case "split-top":
        this._insertSplit(widget, ref, refNode, "vertical", false);
        break;
      case "split-left":
        this._insertSplit(widget, ref, refNode, "horizontal", false);
        break;
      case "split-right":
        this._insertSplit(widget, ref, refNode, "horizontal", true);
        break;
      case "split-bottom":
        this._insertSplit(widget, ref, refNode, "vertical", true);
        break;
      case "merge-top":
        this._insertSplit(widget, ref, refNode, "vertical", false, true);
        break;
      case "merge-left":
        this._insertSplit(widget, ref, refNode, "horizontal", false, true);
        break;
      case "merge-right":
        this._insertSplit(widget, ref, refNode, "horizontal", true, true);
        break;
      case "merge-bottom":
        this._insertSplit(widget, ref, refNode, "vertical", true, true);
        break;
    }
    if (!this.parent) {
      return;
    }
    this.attachWidget(widget);
    this.parent.fit();
  }
  /**
   * Remove a widget from the layout.
   *
   * @param widget - The widget to remove from the layout.
   *
   * #### Notes
   * A widget is automatically removed from the layout when its `parent`
   * is set to `null`. This method should only be invoked directly when
   * removing a widget from a layout which has yet to be installed on a
   * parent widget.
   *
   * This method does *not* modify the widget's `parent`.
   */
  removeWidget(widget) {
    this._removeWidget(widget);
    if (!this.parent) {
      return;
    }
    this.detachWidget(widget);
    this.parent.fit();
  }
  /**
   * Find the tab area which contains the given client position.
   *
   * @param clientX - The client X position of interest.
   *
   * @param clientY - The client Y position of interest.
   *
   * @returns The geometry of the tab area at the given position, or
   *   `null` if there is no tab area at the given position.
   */
  hitTestTabAreas(clientX, clientY) {
    if (!this._root || !this.parent || !this.parent.isVisible) {
      return null;
    }
    if (!this._box) {
      this._box = import_domutils2.ElementExt.boxSizing(this.parent.node);
    }
    let rect = this.parent.node.getBoundingClientRect();
    let x = clientX - rect.left - this._box.borderLeft;
    let y = clientY - rect.top - this._box.borderTop;
    let tabNode = this._root.hitTestTabNodes(x, y);
    if (!tabNode) {
      return null;
    }
    let { tabBar, top, left, width, height } = tabNode;
    let borderWidth = this._box.borderLeft + this._box.borderRight;
    let borderHeight = this._box.borderTop + this._box.borderBottom;
    let right = rect.width - borderWidth - (left + width);
    let bottom = rect.height - borderHeight - (top + height);
    return { tabBar, x, y, top, left, right, bottom, width, height };
  }
  /**
   * Perform layout initialization which requires the parent widget.
   */
  init() {
    super.init();
    for (const widget of this) {
      this.attachWidget(widget);
    }
    for (const handle of this.handles()) {
      this.parent.node.appendChild(handle);
    }
    this.parent.fit();
  }
  /**
   * Attach the widget to the layout parent widget.
   *
   * @param widget - The widget to attach to the parent.
   *
   * #### Notes
   * This is a no-op if the widget is already attached.
   */
  attachWidget(widget) {
    if (this.parent.node === widget.node.parentNode) {
      return;
    }
    this._items.set(widget, new LayoutItem(widget));
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.BeforeAttach);
    }
    this.parent.node.appendChild(widget.node);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.AfterAttach);
    }
  }
  /**
   * Detach the widget from the layout parent widget.
   *
   * @param widget - The widget to detach from the parent.
   *
   * #### Notes
   * This is a no-op if the widget is not attached.
   */
  detachWidget(widget) {
    if (this.parent.node !== widget.node.parentNode) {
      return;
    }
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.BeforeDetach);
    }
    this.parent.node.removeChild(widget.node);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.AfterDetach);
    }
    let item = this._items.get(widget);
    if (item) {
      this._items.delete(widget);
      item.dispose();
    }
  }
  /**
   * A message handler invoked on a `'before-show'` message.
   */
  onBeforeShow(msg) {
    super.onBeforeShow(msg);
    this.parent.update();
  }
  /**
   * A message handler invoked on a `'before-attach'` message.
   */
  onBeforeAttach(msg) {
    super.onBeforeAttach(msg);
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'child-shown'` message.
   */
  onChildShown(msg) {
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'child-hidden'` message.
   */
  onChildHidden(msg) {
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'resize'` message.
   */
  onResize(msg) {
    if (this.parent.isVisible) {
      this._update(msg.width, msg.height);
    }
  }
  /**
   * A message handler invoked on an `'update-request'` message.
   */
  onUpdateRequest(msg) {
    if (this.parent.isVisible) {
      this._update(-1, -1);
    }
  }
  /**
   * A message handler invoked on a `'fit-request'` message.
   */
  onFitRequest(msg) {
    if (this.parent.isAttached) {
      this._fit();
    }
  }
  /**
   * Remove the specified widget from the layout structure.
   *
   * #### Notes
   * This is a no-op if the widget is not in the layout tree.
   *
   * This does not detach the widget from the parent node.
   */
  _removeWidget(widget) {
    if (!this._root) {
      return;
    }
    let tabNode = this._root.findTabNode(widget);
    if (!tabNode) {
      return;
    }
    Private$6.removeAria(widget);
    if (tabNode.tabBar.titles.length > 1) {
      tabNode.tabBar.removeTab(widget.title);
      if (this._hiddenMode === Widget.HiddenMode.Scale && tabNode.tabBar.titles.length == 1) {
        const existingWidget = tabNode.tabBar.titles[0].owner;
        existingWidget.hiddenMode = Widget.HiddenMode.Display;
      }
      return;
    }
    tabNode.tabBar.dispose();
    if (this._root === tabNode) {
      this._root = null;
      return;
    }
    this._root.holdAllSizes();
    let splitNode = tabNode.parent;
    tabNode.parent = null;
    let i = import_algorithm2.ArrayExt.removeFirstOf(splitNode.children, tabNode);
    let handle = import_algorithm2.ArrayExt.removeAt(splitNode.handles, i);
    import_algorithm2.ArrayExt.removeAt(splitNode.sizers, i);
    if (handle.parentNode) {
      handle.parentNode.removeChild(handle);
    }
    if (splitNode.children.length > 1) {
      splitNode.syncHandles();
      return;
    }
    let maybeParent = splitNode.parent;
    splitNode.parent = null;
    let childNode = splitNode.children[0];
    let childHandle = splitNode.handles[0];
    splitNode.children.length = 0;
    splitNode.handles.length = 0;
    splitNode.sizers.length = 0;
    if (childHandle.parentNode) {
      childHandle.parentNode.removeChild(childHandle);
    }
    if (this._root === splitNode) {
      childNode.parent = null;
      this._root = childNode;
      return;
    }
    let parentNode = maybeParent;
    let j = parentNode.children.indexOf(splitNode);
    if (childNode instanceof Private$6.TabLayoutNode) {
      childNode.parent = parentNode;
      parentNode.children[j] = childNode;
      return;
    }
    let splitHandle = import_algorithm2.ArrayExt.removeAt(parentNode.handles, j);
    import_algorithm2.ArrayExt.removeAt(parentNode.children, j);
    import_algorithm2.ArrayExt.removeAt(parentNode.sizers, j);
    if (splitHandle.parentNode) {
      splitHandle.parentNode.removeChild(splitHandle);
    }
    for (let i2 = 0, n = childNode.children.length; i2 < n; ++i2) {
      let gChild = childNode.children[i2];
      let gHandle = childNode.handles[i2];
      let gSizer = childNode.sizers[i2];
      import_algorithm2.ArrayExt.insert(parentNode.children, j + i2, gChild);
      import_algorithm2.ArrayExt.insert(parentNode.handles, j + i2, gHandle);
      import_algorithm2.ArrayExt.insert(parentNode.sizers, j + i2, gSizer);
      gChild.parent = parentNode;
    }
    childNode.children.length = 0;
    childNode.handles.length = 0;
    childNode.sizers.length = 0;
    childNode.parent = null;
    parentNode.syncHandles();
  }
  /**
   * Create the tab layout node to hold the widget.
   */
  _createTabNode(widget) {
    let tabNode = new Private$6.TabLayoutNode(this._createTabBar());
    tabNode.tabBar.addTab(widget.title);
    Private$6.addAria(widget, tabNode.tabBar);
    return tabNode;
  }
  /**
   * Insert a widget next to an existing tab.
   *
   * #### Notes
   * This does not attach the widget to the parent widget.
   */
  _insertTab(widget, ref, refNode, after) {
    if (widget === ref) {
      return;
    }
    if (!this._root) {
      let tabNode = new Private$6.TabLayoutNode(this._createTabBar());
      tabNode.tabBar.addTab(widget.title);
      this._root = tabNode;
      Private$6.addAria(widget, tabNode.tabBar);
      return;
    }
    if (!refNode) {
      refNode = this._root.findFirstTabNode();
    }
    if (refNode.tabBar.titles.indexOf(widget.title) === -1) {
      this._removeWidget(widget);
      widget.hide();
    }
    let index;
    if (ref) {
      index = refNode.tabBar.titles.indexOf(ref.title);
    } else {
      index = refNode.tabBar.currentIndex;
    }
    if (this._hiddenMode === Widget.HiddenMode.Scale) {
      if (refNode.tabBar.titles.length === 0) {
        widget.hiddenMode = Widget.HiddenMode.Display;
      } else if (refNode.tabBar.titles.length == 1) {
        const existingWidget = refNode.tabBar.titles[0].owner;
        existingWidget.hiddenMode = Widget.HiddenMode.Scale;
      } else {
        widget.hiddenMode = Widget.HiddenMode.Scale;
      }
    } else {
      widget.hiddenMode = this._hiddenMode;
    }
    refNode.tabBar.insertTab(index + (after ? 1 : 0), widget.title);
    Private$6.addAria(widget, refNode.tabBar);
  }
  /**
   * Insert a widget as a new split area.
   *
   * #### Notes
   * This does not attach the widget to the parent widget.
   */
  _insertSplit(widget, ref, refNode, orientation, after, merge = false) {
    if (widget === ref && refNode && refNode.tabBar.titles.length === 1) {
      return;
    }
    this._removeWidget(widget);
    if (!this._root) {
      this._root = this._createTabNode(widget);
      return;
    }
    if (!refNode || !refNode.parent) {
      let root = this._splitRoot(orientation);
      let i2 = after ? root.children.length : 0;
      root.normalizeSizes();
      let sizer = Private$6.createSizer(refNode ? 1 : Private$6.GOLDEN_RATIO);
      let tabNode2 = this._createTabNode(widget);
      import_algorithm2.ArrayExt.insert(root.children, i2, tabNode2);
      import_algorithm2.ArrayExt.insert(root.sizers, i2, sizer);
      import_algorithm2.ArrayExt.insert(root.handles, i2, this._createHandle());
      tabNode2.parent = root;
      root.normalizeSizes();
      root.syncHandles();
      return;
    }
    let splitNode = refNode.parent;
    if (splitNode.orientation === orientation) {
      let i2 = splitNode.children.indexOf(refNode);
      if (merge) {
        let j3 = i2 + (after ? 1 : -1);
        let sibling = splitNode.children[j3];
        if (sibling instanceof Private$6.TabLayoutNode) {
          this._insertTab(widget, null, sibling, true);
          ++sibling.tabBar.currentIndex;
          return;
        }
      }
      splitNode.normalizeSizes();
      let s = splitNode.sizers[i2].sizeHint /= 2;
      let j2 = i2 + (after ? 1 : 0);
      let tabNode2 = this._createTabNode(widget);
      import_algorithm2.ArrayExt.insert(splitNode.children, j2, tabNode2);
      import_algorithm2.ArrayExt.insert(splitNode.sizers, j2, Private$6.createSizer(s));
      import_algorithm2.ArrayExt.insert(splitNode.handles, j2, this._createHandle());
      tabNode2.parent = splitNode;
      splitNode.syncHandles();
      return;
    }
    let i = import_algorithm2.ArrayExt.removeFirstOf(splitNode.children, refNode);
    let childNode = new Private$6.SplitLayoutNode(orientation);
    childNode.normalized = true;
    childNode.children.push(refNode);
    childNode.sizers.push(Private$6.createSizer(0.5));
    childNode.handles.push(this._createHandle());
    refNode.parent = childNode;
    let j = after ? 1 : 0;
    let tabNode = this._createTabNode(widget);
    import_algorithm2.ArrayExt.insert(childNode.children, j, tabNode);
    import_algorithm2.ArrayExt.insert(childNode.sizers, j, Private$6.createSizer(0.5));
    import_algorithm2.ArrayExt.insert(childNode.handles, j, this._createHandle());
    tabNode.parent = childNode;
    childNode.syncHandles();
    import_algorithm2.ArrayExt.insert(splitNode.children, i, childNode);
    childNode.parent = splitNode;
  }
  /**
   * Ensure the root is a split node with the given orientation.
   */
  _splitRoot(orientation) {
    let oldRoot = this._root;
    if (oldRoot instanceof Private$6.SplitLayoutNode) {
      if (oldRoot.orientation === orientation) {
        return oldRoot;
      }
    }
    let newRoot = this._root = new Private$6.SplitLayoutNode(orientation);
    if (oldRoot) {
      newRoot.children.push(oldRoot);
      newRoot.sizers.push(Private$6.createSizer(0));
      newRoot.handles.push(this._createHandle());
      oldRoot.parent = newRoot;
    }
    return newRoot;
  }
  /**
   * Fit the layout to the total size required by the widgets.
   */
  _fit() {
    let minW = 0;
    let minH = 0;
    if (this._root) {
      let limits = this._root.fit(this._spacing, this._items);
      minW = limits.minWidth;
      minH = limits.minHeight;
    }
    let box = this._box = import_domutils2.ElementExt.boxSizing(this.parent.node);
    minW += box.horizontalSum;
    minH += box.verticalSum;
    let style = this.parent.node.style;
    style.minWidth = `${minW}px`;
    style.minHeight = `${minH}px`;
    this._dirty = true;
    if (this.parent.parent) {
      import_messaging.MessageLoop.sendMessage(this.parent.parent, Widget.Msg.FitRequest);
    }
    if (this._dirty) {
      import_messaging.MessageLoop.sendMessage(this.parent, Widget.Msg.UpdateRequest);
    }
  }
  /**
   * Update the layout position and size of the widgets.
   *
   * The parent offset dimensions should be `-1` if unknown.
   */
  _update(offsetWidth, offsetHeight) {
    this._dirty = false;
    if (!this._root) {
      return;
    }
    if (offsetWidth < 0) {
      offsetWidth = this.parent.node.offsetWidth;
    }
    if (offsetHeight < 0) {
      offsetHeight = this.parent.node.offsetHeight;
    }
    if (!this._box) {
      this._box = import_domutils2.ElementExt.boxSizing(this.parent.node);
    }
    let x = this._box.paddingTop;
    let y = this._box.paddingLeft;
    let width = offsetWidth - this._box.horizontalSum;
    let height = offsetHeight - this._box.verticalSum;
    this._root.update(x, y, width, height, this._spacing, this._items);
  }
  /**
   * Create a new tab bar for use by the dock layout.
   *
   * #### Notes
   * The tab bar will be attached to the parent if it exists.
   */
  _createTabBar() {
    let tabBar = this.renderer.createTabBar(this._document);
    tabBar.orientation = "horizontal";
    if (this.parent) {
      this.attachWidget(tabBar);
    }
    return tabBar;
  }
  /**
   * Create a new handle for the dock layout.
   *
   * #### Notes
   * The handle will be attached to the parent if it exists.
   */
  _createHandle() {
    let handle = this.renderer.createHandle();
    let style = handle.style;
    style.position = "absolute";
    style.contain = "strict";
    style.top = "0";
    style.left = "0";
    style.width = "0";
    style.height = "0";
    if (this.parent) {
      this.parent.node.appendChild(handle);
    }
    return handle;
  }
};
var Private$6;
(function(Private6) {
  Private6.GOLDEN_RATIO = 0.618;
  function createSizer(hint) {
    let sizer = new BoxSizer();
    sizer.sizeHint = hint;
    sizer.size = hint;
    return sizer;
  }
  Private6.createSizer = createSizer;
  function normalizeAreaConfig(config, widgetSet) {
    let result;
    if (config.type === "tab-area") {
      result = normalizeTabAreaConfig(config, widgetSet);
    } else {
      result = normalizeSplitAreaConfig(config, widgetSet);
    }
    return result;
  }
  Private6.normalizeAreaConfig = normalizeAreaConfig;
  function realizeAreaConfig(config, renderer, document2) {
    let node;
    if (config.type === "tab-area") {
      node = realizeTabAreaConfig(config, renderer, document2);
    } else {
      node = realizeSplitAreaConfig(config, renderer, document2);
    }
    return node;
  }
  Private6.realizeAreaConfig = realizeAreaConfig;
  class TabLayoutNode {
    /**
     * Construct a new tab layout node.
     *
     * @param tabBar - The tab bar to use for the layout node.
     */
    constructor(tabBar) {
      this.parent = null;
      this._top = 0;
      this._left = 0;
      this._width = 0;
      this._height = 0;
      let tabSizer = new BoxSizer();
      let widgetSizer = new BoxSizer();
      tabSizer.stretch = 0;
      widgetSizer.stretch = 1;
      this.tabBar = tabBar;
      this.sizers = [tabSizer, widgetSizer];
    }
    /**
     * The most recent value for the `top` edge of the layout box.
     */
    get top() {
      return this._top;
    }
    /**
     * The most recent value for the `left` edge of the layout box.
     */
    get left() {
      return this._left;
    }
    /**
     * The most recent value for the `width` of the layout box.
     */
    get width() {
      return this._width;
    }
    /**
     * The most recent value for the `height` of the layout box.
     */
    get height() {
      return this._height;
    }
    /**
     * Create an iterator for all widgets in the layout tree.
     */
    *iterAllWidgets() {
      yield this.tabBar;
      yield* this.iterUserWidgets();
    }
    /**
     * Create an iterator for the user widgets in the layout tree.
     */
    *iterUserWidgets() {
      for (const title of this.tabBar.titles) {
        yield title.owner;
      }
    }
    /**
     * Create an iterator for the selected widgets in the layout tree.
     */
    *iterSelectedWidgets() {
      let title = this.tabBar.currentTitle;
      if (title) {
        yield title.owner;
      }
    }
    /**
     * Create an iterator for the tab bars in the layout tree.
     */
    *iterTabBars() {
      yield this.tabBar;
    }
    /**
     * Create an iterator for the handles in the layout tree.
     */
    // eslint-disable-next-line require-yield
    *iterHandles() {
      return;
    }
    /**
     * Find the tab layout node which contains the given widget.
     */
    findTabNode(widget) {
      return this.tabBar.titles.indexOf(widget.title) !== -1 ? this : null;
    }
    /**
     * Find the split layout node which contains the given handle.
     */
    findSplitNode(handle) {
      return null;
    }
    /**
     * Find the first tab layout node in a layout tree.
     */
    findFirstTabNode() {
      return this;
    }
    /**
     * Find the tab layout node which contains the local point.
     */
    hitTestTabNodes(x, y) {
      if (x < this._left || x >= this._left + this._width) {
        return null;
      }
      if (y < this._top || y >= this._top + this._height) {
        return null;
      }
      return this;
    }
    /**
     * Create a configuration object for the layout tree.
     */
    createConfig() {
      let widgets = this.tabBar.titles.map((title) => title.owner);
      let currentIndex = this.tabBar.currentIndex;
      return { type: "tab-area", widgets, currentIndex };
    }
    /**
     * Recursively hold all of the sizes in the layout tree.
     *
     * This ignores the sizers of tab layout nodes.
     */
    holdAllSizes() {
      return;
    }
    /**
     * Fit the layout tree.
     */
    fit(spacing, items) {
      let minWidth = 0;
      let minHeight = 0;
      let maxWidth = Infinity;
      let maxHeight = Infinity;
      let tabBarItem = items.get(this.tabBar);
      let current = this.tabBar.currentTitle;
      let widgetItem = current ? items.get(current.owner) : void 0;
      let [tabBarSizer, widgetSizer] = this.sizers;
      if (tabBarItem) {
        tabBarItem.fit();
      }
      if (widgetItem) {
        widgetItem.fit();
      }
      if (tabBarItem && !tabBarItem.isHidden) {
        minWidth = Math.max(minWidth, tabBarItem.minWidth);
        minHeight += tabBarItem.minHeight;
        tabBarSizer.minSize = tabBarItem.minHeight;
        tabBarSizer.maxSize = tabBarItem.maxHeight;
      } else {
        tabBarSizer.minSize = 0;
        tabBarSizer.maxSize = 0;
      }
      if (widgetItem && !widgetItem.isHidden) {
        minWidth = Math.max(minWidth, widgetItem.minWidth);
        minHeight += widgetItem.minHeight;
        widgetSizer.minSize = widgetItem.minHeight;
        widgetSizer.maxSize = Infinity;
      } else {
        widgetSizer.minSize = 0;
        widgetSizer.maxSize = Infinity;
      }
      return { minWidth, minHeight, maxWidth, maxHeight };
    }
    /**
     * Update the layout tree.
     */
    update(left, top, width, height, spacing, items) {
      this._top = top;
      this._left = left;
      this._width = width;
      this._height = height;
      let tabBarItem = items.get(this.tabBar);
      let current = this.tabBar.currentTitle;
      let widgetItem = current ? items.get(current.owner) : void 0;
      BoxEngine.calc(this.sizers, height);
      if (tabBarItem && !tabBarItem.isHidden) {
        let size = this.sizers[0].size;
        tabBarItem.update(left, top, width, size);
        top += size;
      }
      if (widgetItem && !widgetItem.isHidden) {
        let size = this.sizers[1].size;
        widgetItem.update(left, top, width, size);
      }
    }
  }
  Private6.TabLayoutNode = TabLayoutNode;
  class SplitLayoutNode {
    /**
     * Construct a new split layout node.
     *
     * @param orientation - The orientation of the node.
     */
    constructor(orientation) {
      this.parent = null;
      this.normalized = false;
      this.children = [];
      this.sizers = [];
      this.handles = [];
      this.orientation = orientation;
    }
    /**
     * Create an iterator for all widgets in the layout tree.
     */
    *iterAllWidgets() {
      for (const child of this.children) {
        yield* child.iterAllWidgets();
      }
    }
    /**
     * Create an iterator for the user widgets in the layout tree.
     */
    *iterUserWidgets() {
      for (const child of this.children) {
        yield* child.iterUserWidgets();
      }
    }
    /**
     * Create an iterator for the selected widgets in the layout tree.
     */
    *iterSelectedWidgets() {
      for (const child of this.children) {
        yield* child.iterSelectedWidgets();
      }
    }
    /**
     * Create an iterator for the tab bars in the layout tree.
     */
    *iterTabBars() {
      for (const child of this.children) {
        yield* child.iterTabBars();
      }
    }
    /**
     * Create an iterator for the handles in the layout tree.
     */
    *iterHandles() {
      yield* this.handles;
      for (const child of this.children) {
        yield* child.iterHandles();
      }
    }
    /**
     * Find the tab layout node which contains the given widget.
     */
    findTabNode(widget) {
      for (let i = 0, n = this.children.length; i < n; ++i) {
        let result = this.children[i].findTabNode(widget);
        if (result) {
          return result;
        }
      }
      return null;
    }
    /**
     * Find the split layout node which contains the given handle.
     */
    findSplitNode(handle) {
      let index = this.handles.indexOf(handle);
      if (index !== -1) {
        return { index, node: this };
      }
      for (let i = 0, n = this.children.length; i < n; ++i) {
        let result = this.children[i].findSplitNode(handle);
        if (result) {
          return result;
        }
      }
      return null;
    }
    /**
     * Find the first tab layout node in a layout tree.
     */
    findFirstTabNode() {
      if (this.children.length === 0) {
        return null;
      }
      return this.children[0].findFirstTabNode();
    }
    /**
     * Find the tab layout node which contains the local point.
     */
    hitTestTabNodes(x, y) {
      for (let i = 0, n = this.children.length; i < n; ++i) {
        let result = this.children[i].hitTestTabNodes(x, y);
        if (result) {
          return result;
        }
      }
      return null;
    }
    /**
     * Create a configuration object for the layout tree.
     */
    createConfig() {
      let orientation = this.orientation;
      let sizes = this.createNormalizedSizes();
      let children = this.children.map((child) => child.createConfig());
      return { type: "split-area", orientation, children, sizes };
    }
    /**
     * Sync the visibility and orientation of the handles.
     */
    syncHandles() {
      this.handles.forEach((handle, i) => {
        handle.setAttribute("data-orientation", this.orientation);
        if (i === this.handles.length - 1) {
          handle.classList.add("lm-mod-hidden");
        } else {
          handle.classList.remove("lm-mod-hidden");
        }
      });
    }
    /**
     * Hold the current sizes of the box sizers.
     *
     * This sets the size hint of each sizer to its current size.
     */
    holdSizes() {
      for (const sizer of this.sizers) {
        sizer.sizeHint = sizer.size;
      }
    }
    /**
     * Recursively hold all of the sizes in the layout tree.
     *
     * This ignores the sizers of tab layout nodes.
     */
    holdAllSizes() {
      for (const child of this.children) {
        child.holdAllSizes();
      }
      this.holdSizes();
    }
    /**
     * Normalize the sizes of the split layout node.
     */
    normalizeSizes() {
      let n = this.sizers.length;
      if (n === 0) {
        return;
      }
      this.holdSizes();
      let sum = this.sizers.reduce((v, sizer) => v + sizer.sizeHint, 0);
      if (sum === 0) {
        for (const sizer of this.sizers) {
          sizer.size = sizer.sizeHint = 1 / n;
        }
      } else {
        for (const sizer of this.sizers) {
          sizer.size = sizer.sizeHint /= sum;
        }
      }
      this.normalized = true;
    }
    /**
     * Snap the normalized sizes of the split layout node.
     */
    createNormalizedSizes() {
      let n = this.sizers.length;
      if (n === 0) {
        return [];
      }
      let sizes = this.sizers.map((sizer) => sizer.size);
      let sum = sizes.reduce((v, size) => v + size, 0);
      if (sum === 0) {
        for (let i = sizes.length - 1; i > -1; i--) {
          sizes[i] = 1 / n;
        }
      } else {
        for (let i = sizes.length - 1; i > -1; i--) {
          sizes[i] /= sum;
        }
      }
      return sizes;
    }
    /**
     * Fit the layout tree.
     */
    fit(spacing, items) {
      let horizontal = this.orientation === "horizontal";
      let fixed = Math.max(0, this.children.length - 1) * spacing;
      let minWidth = horizontal ? fixed : 0;
      let minHeight = horizontal ? 0 : fixed;
      let maxWidth = Infinity;
      let maxHeight = Infinity;
      for (let i = 0, n = this.children.length; i < n; ++i) {
        let limits = this.children[i].fit(spacing, items);
        if (horizontal) {
          minHeight = Math.max(minHeight, limits.minHeight);
          minWidth += limits.minWidth;
          this.sizers[i].minSize = limits.minWidth;
        } else {
          minWidth = Math.max(minWidth, limits.minWidth);
          minHeight += limits.minHeight;
          this.sizers[i].minSize = limits.minHeight;
        }
      }
      return { minWidth, minHeight, maxWidth, maxHeight };
    }
    /**
     * Update the layout tree.
     */
    update(left, top, width, height, spacing, items) {
      let horizontal = this.orientation === "horizontal";
      let fixed = Math.max(0, this.children.length - 1) * spacing;
      let space = Math.max(0, (horizontal ? width : height) - fixed);
      if (this.normalized) {
        for (const sizer of this.sizers) {
          sizer.sizeHint *= space;
        }
        this.normalized = false;
      }
      BoxEngine.calc(this.sizers, space);
      for (let i = 0, n = this.children.length; i < n; ++i) {
        let child = this.children[i];
        let size = this.sizers[i].size;
        let handleStyle = this.handles[i].style;
        if (horizontal) {
          child.update(left, top, size, height, spacing, items);
          left += size;
          handleStyle.top = `${top}px`;
          handleStyle.left = `${left}px`;
          handleStyle.width = `${spacing}px`;
          handleStyle.height = `${height}px`;
          left += spacing;
        } else {
          child.update(left, top, width, size, spacing, items);
          top += size;
          handleStyle.top = `${top}px`;
          handleStyle.left = `${left}px`;
          handleStyle.width = `${width}px`;
          handleStyle.height = `${spacing}px`;
          top += spacing;
        }
      }
    }
  }
  Private6.SplitLayoutNode = SplitLayoutNode;
  function addAria(widget, tabBar) {
    widget.node.setAttribute("role", "tabpanel");
    let renderer = tabBar.renderer;
    if (renderer instanceof TabBar.Renderer) {
      let tabId = renderer.createTabKey({
        title: widget.title,
        current: false,
        zIndex: 0
      });
      widget.node.setAttribute("aria-labelledby", tabId);
    }
  }
  Private6.addAria = addAria;
  function removeAria(widget) {
    widget.node.removeAttribute("role");
    widget.node.removeAttribute("aria-labelledby");
  }
  Private6.removeAria = removeAria;
  function normalizeTabAreaConfig(config, widgetSet) {
    if (config.widgets.length === 0) {
      return null;
    }
    let widgets = [];
    for (const widget of config.widgets) {
      if (!widgetSet.has(widget)) {
        widgetSet.add(widget);
        widgets.push(widget);
      }
    }
    if (widgets.length === 0) {
      return null;
    }
    let index = config.currentIndex;
    if (index !== -1 && (index < 0 || index >= widgets.length)) {
      index = 0;
    }
    return { type: "tab-area", widgets, currentIndex: index };
  }
  function normalizeSplitAreaConfig(config, widgetSet) {
    let orientation = config.orientation;
    let children = [];
    let sizes = [];
    for (let i = 0, n = config.children.length; i < n; ++i) {
      let child = normalizeAreaConfig(config.children[i], widgetSet);
      if (!child) {
        continue;
      }
      if (child.type === "tab-area" || child.orientation !== orientation) {
        children.push(child);
        sizes.push(Math.abs(config.sizes[i] || 0));
      } else {
        children.push(...child.children);
        sizes.push(...child.sizes);
      }
    }
    if (children.length === 0) {
      return null;
    }
    if (children.length === 1) {
      return children[0];
    }
    return { type: "split-area", orientation, children, sizes };
  }
  function realizeTabAreaConfig(config, renderer, document2) {
    let tabBar = renderer.createTabBar(document2);
    for (const widget of config.widgets) {
      widget.hide();
      tabBar.addTab(widget.title);
      Private6.addAria(widget, tabBar);
    }
    tabBar.currentIndex = config.currentIndex;
    return new TabLayoutNode(tabBar);
  }
  function realizeSplitAreaConfig(config, renderer, document2) {
    let node = new SplitLayoutNode(config.orientation);
    config.children.forEach((child, i) => {
      let childNode = realizeAreaConfig(child, renderer, document2);
      let sizer = createSizer(config.sizes[i]);
      let handle = renderer.createHandle();
      node.children.push(childNode);
      node.handles.push(handle);
      node.sizers.push(sizer);
      childNode.parent = node;
    });
    node.syncHandles();
    node.normalizeSizes();
    return node;
  }
})(Private$6 || (Private$6 = {}));
var DockPanel = class _DockPanel extends Widget {
  /**
   * Construct a new dock panel.
   *
   * @param options - The options for initializing the panel.
   */
  constructor(options = {}) {
    super();
    this._drag = null;
    this._tabsMovable = true;
    this._tabsConstrained = false;
    this._addButtonEnabled = false;
    this._pressData = null;
    this._layoutModified = new import_signaling2.Signal(this);
    this._addRequested = new import_signaling2.Signal(this);
    this.addClass("lm-DockPanel");
    this._document = options.document || document;
    this._mode = options.mode || "multiple-document";
    this._renderer = options.renderer || _DockPanel.defaultRenderer;
    this._edges = options.edges || Private$5.DEFAULT_EDGES;
    if (options.tabsMovable !== void 0) {
      this._tabsMovable = options.tabsMovable;
    }
    if (options.tabsConstrained !== void 0) {
      this._tabsConstrained = options.tabsConstrained;
    }
    if (options.addButtonEnabled !== void 0) {
      this._addButtonEnabled = options.addButtonEnabled;
    }
    this.dataset["mode"] = this._mode;
    let renderer = {
      createTabBar: () => this._createTabBar(),
      createHandle: () => this._createHandle()
    };
    this.layout = new DockLayout({
      document: this._document,
      renderer,
      spacing: options.spacing,
      hiddenMode: options.hiddenMode
    });
    this.overlay = options.overlay || new _DockPanel.Overlay();
    this.node.appendChild(this.overlay.node);
  }
  /**
   * Dispose of the resources held by the panel.
   */
  dispose() {
    this._releaseMouse();
    this.overlay.hide(0);
    if (this._drag) {
      this._drag.dispose();
    }
    super.dispose();
  }
  /**
   * The method for hiding widgets.
   */
  get hiddenMode() {
    return this.layout.hiddenMode;
  }
  /**
   * Set the method for hiding widgets.
   */
  set hiddenMode(v) {
    this.layout.hiddenMode = v;
  }
  /**
   * A signal emitted when the layout configuration is modified.
   *
   * #### Notes
   * This signal is emitted whenever the current layout configuration
   * may have changed.
   *
   * This signal is emitted asynchronously in a collapsed fashion, so
   * that multiple synchronous modifications results in only a single
   * emit of the signal.
   */
  get layoutModified() {
    return this._layoutModified;
  }
  /**
   * A signal emitted when the add button on a tab bar is clicked.
   *
   */
  get addRequested() {
    return this._addRequested;
  }
  /**
   * The renderer used by the dock panel.
   */
  get renderer() {
    return this.layout.renderer;
  }
  /**
   * Get the spacing between the widgets.
   */
  get spacing() {
    return this.layout.spacing;
  }
  /**
   * Set the spacing between the widgets.
   */
  set spacing(value) {
    this.layout.spacing = value;
  }
  /**
   * Get the mode for the dock panel.
   */
  get mode() {
    return this._mode;
  }
  /**
   * Set the mode for the dock panel.
   *
   * #### Notes
   * Changing the mode is a destructive operation with respect to the
   * panel's layout configuration. If layout state must be preserved,
   * save the current layout config before changing the mode.
   */
  set mode(value) {
    if (this._mode === value) {
      return;
    }
    this._mode = value;
    this.dataset["mode"] = value;
    let layout = this.layout;
    switch (value) {
      case "multiple-document":
        for (const tabBar of layout.tabBars()) {
          tabBar.show();
        }
        break;
      case "single-document":
        layout.restoreLayout(Private$5.createSingleDocumentConfig(this));
        break;
      default:
        throw "unreachable";
    }
    import_messaging.MessageLoop.postMessage(this, Private$5.LayoutModified);
  }
  /**
   * Whether the tabs can be dragged / moved at runtime.
   */
  get tabsMovable() {
    return this._tabsMovable;
  }
  /**
   * Enable / Disable draggable / movable tabs.
   */
  set tabsMovable(value) {
    this._tabsMovable = value;
    for (const tabBar of this.tabBars()) {
      tabBar.tabsMovable = value;
    }
  }
  /**
   * Whether the tabs are constrained to their source dock panel
   */
  get tabsConstrained() {
    return this._tabsConstrained;
  }
  /**
   * Constrain/Allow tabs to be dragged outside of this dock panel
   */
  set tabsConstrained(value) {
    this._tabsConstrained = value;
  }
  /**
   * Whether the add buttons for each tab bar are enabled.
   */
  get addButtonEnabled() {
    return this._addButtonEnabled;
  }
  /**
   * Set whether the add buttons for each tab bar are enabled.
   */
  set addButtonEnabled(value) {
    this._addButtonEnabled = value;
    for (const tabBar of this.tabBars()) {
      tabBar.addButtonEnabled = value;
    }
  }
  /**
   * Whether the dock panel is empty.
   */
  get isEmpty() {
    return this.layout.isEmpty;
  }
  /**
   * Create an iterator over the user widgets in the panel.
   *
   * @returns A new iterator over the user widgets in the panel.
   *
   * #### Notes
   * This iterator does not include the generated tab bars.
   */
  *widgets() {
    yield* this.layout.widgets();
  }
  /**
   * Create an iterator over the selected widgets in the panel.
   *
   * @returns A new iterator over the selected user widgets.
   *
   * #### Notes
   * This iterator yields the widgets corresponding to the current tab
   * of each tab bar in the panel.
   */
  *selectedWidgets() {
    yield* this.layout.selectedWidgets();
  }
  /**
   * Create an iterator over the tab bars in the panel.
   *
   * @returns A new iterator over the tab bars in the panel.
   *
   * #### Notes
   * This iterator does not include the user widgets.
   */
  *tabBars() {
    yield* this.layout.tabBars();
  }
  /**
   * Create an iterator over the handles in the panel.
   *
   * @returns A new iterator over the handles in the panel.
   */
  *handles() {
    yield* this.layout.handles();
  }
  /**
   * Select a specific widget in the dock panel.
   *
   * @param widget - The widget of interest.
   *
   * #### Notes
   * This will make the widget the current widget in its tab area.
   */
  selectWidget(widget) {
    let tabBar = (0, import_algorithm2.find)(this.tabBars(), (bar) => {
      return bar.titles.indexOf(widget.title) !== -1;
    });
    if (!tabBar) {
      throw new Error("Widget is not contained in the dock panel.");
    }
    tabBar.currentTitle = widget.title;
  }
  /**
   * Activate a specified widget in the dock panel.
   *
   * @param widget - The widget of interest.
   *
   * #### Notes
   * This will select and activate the given widget.
   */
  activateWidget(widget) {
    this.selectWidget(widget);
    widget.activate();
  }
  /**
   * Save the current layout configuration of the dock panel.
   *
   * @returns A new config object for the current layout state.
   *
   * #### Notes
   * The return value can be provided to the `restoreLayout` method
   * in order to restore the layout to its current configuration.
   */
  saveLayout() {
    return this.layout.saveLayout();
  }
  /**
   * Restore the layout to a previously saved configuration.
   *
   * @param config - The layout configuration to restore.
   *
   * #### Notes
   * Widgets which currently belong to the layout but which are not
   * contained in the config will be unparented.
   *
   * The dock panel automatically reverts to `'multiple-document'`
   * mode when a layout config is restored.
   */
  restoreLayout(config) {
    this._mode = "multiple-document";
    this.layout.restoreLayout(config);
    if (import_domutils2.Platform.IS_EDGE || import_domutils2.Platform.IS_IE) {
      import_messaging.MessageLoop.flush();
    }
    import_messaging.MessageLoop.postMessage(this, Private$5.LayoutModified);
  }
  /**
   * Add a widget to the dock panel.
   *
   * @param widget - The widget to add to the dock panel.
   *
   * @param options - The additional options for adding the widget.
   *
   * #### Notes
   * If the panel is in single document mode, the options are ignored
   * and the widget is always added as tab in the hidden tab bar.
   */
  addWidget(widget, options = {}) {
    if (this._mode === "single-document") {
      this.layout.addWidget(widget);
    } else {
      this.layout.addWidget(widget, options);
    }
    import_messaging.MessageLoop.postMessage(this, Private$5.LayoutModified);
  }
  /**
   * Process a message sent to the widget.
   *
   * @param msg - The message sent to the widget.
   */
  processMessage(msg) {
    if (msg.type === "layout-modified") {
      this._layoutModified.emit(void 0);
    } else {
      super.processMessage(msg);
    }
  }
  /**
   * Handle the DOM events for the dock panel.
   *
   * @param event - The DOM event sent to the panel.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the panel's DOM node. It should
   * not be called directly by user code.
   */
  handleEvent(event) {
    switch (event.type) {
      case "lm-dragenter":
        this._evtDragEnter(event);
        break;
      case "lm-dragleave":
        this._evtDragLeave(event);
        break;
      case "lm-dragover":
        this._evtDragOver(event);
        break;
      case "lm-drop":
        this._evtDrop(event);
        break;
      case "pointerdown":
        this._evtPointerDown(event);
        break;
      case "pointermove":
        this._evtPointerMove(event);
        break;
      case "pointerup":
        this._evtPointerUp(event);
        break;
      case "keydown":
        this._evtKeyDown(event);
        break;
      case "contextmenu":
        event.preventDefault();
        event.stopPropagation();
        break;
    }
  }
  /**
   * A message handler invoked on a `'before-attach'` message.
   */
  onBeforeAttach(msg) {
    this.node.addEventListener("lm-dragenter", this);
    this.node.addEventListener("lm-dragleave", this);
    this.node.addEventListener("lm-dragover", this);
    this.node.addEventListener("lm-drop", this);
    this.node.addEventListener("pointerdown", this);
  }
  /**
   * A message handler invoked on an `'after-detach'` message.
   */
  onAfterDetach(msg) {
    this.node.removeEventListener("lm-dragenter", this);
    this.node.removeEventListener("lm-dragleave", this);
    this.node.removeEventListener("lm-dragover", this);
    this.node.removeEventListener("lm-drop", this);
    this.node.removeEventListener("pointerdown", this);
    this._releaseMouse();
  }
  /**
   * A message handler invoked on a `'child-added'` message.
   */
  onChildAdded(msg) {
    if (Private$5.isGeneratedTabBarProperty.get(msg.child)) {
      return;
    }
    msg.child.addClass("lm-DockPanel-widget");
  }
  /**
   * A message handler invoked on a `'child-removed'` message.
   */
  onChildRemoved(msg) {
    if (Private$5.isGeneratedTabBarProperty.get(msg.child)) {
      return;
    }
    msg.child.removeClass("lm-DockPanel-widget");
    import_messaging.MessageLoop.postMessage(this, Private$5.LayoutModified);
  }
  /**
   * Handle the `'lm-dragenter'` event for the dock panel.
   */
  _evtDragEnter(event) {
    if (event.mimeData.hasData("application/vnd.lumino.widget-factory")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  /**
   * Handle the `'lm-dragleave'` event for the dock panel.
   */
  _evtDragLeave(event) {
    event.preventDefault();
    if (this._tabsConstrained && event.source !== this)
      return;
    event.stopPropagation();
    this.overlay.hide(1);
  }
  /**
   * Handle the `'lm-dragover'` event for the dock panel.
   */
  _evtDragOver(event) {
    event.preventDefault();
    if (this._tabsConstrained && event.source !== this || this._showOverlay(event.clientX, event.clientY) === "invalid") {
      event.dropAction = "none";
    } else {
      event.stopPropagation();
      event.dropAction = event.proposedAction;
    }
  }
  /**
   * Handle the `'lm-drop'` event for the dock panel.
   */
  _evtDrop(event) {
    event.preventDefault();
    this.overlay.hide(0);
    if (event.proposedAction === "none") {
      event.dropAction = "none";
      return;
    }
    let { clientX, clientY } = event;
    let { zone, target } = Private$5.findDropTarget(this, clientX, clientY, this._edges);
    if (this._tabsConstrained && event.source !== this || zone === "invalid") {
      event.dropAction = "none";
      return;
    }
    let mimeData = event.mimeData;
    let factory = mimeData.getData("application/vnd.lumino.widget-factory");
    if (typeof factory !== "function") {
      event.dropAction = "none";
      return;
    }
    let widget = factory();
    if (!(widget instanceof Widget)) {
      event.dropAction = "none";
      return;
    }
    if (widget.contains(this)) {
      event.dropAction = "none";
      return;
    }
    let ref = target ? Private$5.getDropRef(target.tabBar) : null;
    switch (zone) {
      case "root-all":
        this.addWidget(widget);
        break;
      case "root-top":
        this.addWidget(widget, { mode: "split-top" });
        break;
      case "root-left":
        this.addWidget(widget, { mode: "split-left" });
        break;
      case "root-right":
        this.addWidget(widget, { mode: "split-right" });
        break;
      case "root-bottom":
        this.addWidget(widget, { mode: "split-bottom" });
        break;
      case "widget-all":
        this.addWidget(widget, { mode: "tab-after", ref });
        break;
      case "widget-top":
        this.addWidget(widget, { mode: "split-top", ref });
        break;
      case "widget-left":
        this.addWidget(widget, { mode: "split-left", ref });
        break;
      case "widget-right":
        this.addWidget(widget, { mode: "split-right", ref });
        break;
      case "widget-bottom":
        this.addWidget(widget, { mode: "split-bottom", ref });
        break;
      case "widget-tab":
        this.addWidget(widget, { mode: "tab-after", ref });
        break;
      default:
        throw "unreachable";
    }
    event.dropAction = event.proposedAction;
    event.stopPropagation();
    this.activateWidget(widget);
  }
  /**
   * Handle the `'keydown'` event for the dock panel.
   */
  _evtKeyDown(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.keyCode === 27) {
      this._releaseMouse();
      import_messaging.MessageLoop.postMessage(this, Private$5.LayoutModified);
    }
  }
  /**
   * Handle the `'pointerdown'` event for the dock panel.
   */
  _evtPointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    let layout = this.layout;
    let target = event.target;
    let handle = (0, import_algorithm2.find)(layout.handles(), (handle2) => handle2.contains(target));
    if (!handle) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this._document.addEventListener("keydown", this, true);
    this._document.addEventListener("pointerup", this, true);
    this._document.addEventListener("pointermove", this, true);
    this._document.addEventListener("contextmenu", this, true);
    let rect = handle.getBoundingClientRect();
    let deltaX = event.clientX - rect.left;
    let deltaY = event.clientY - rect.top;
    let style = window.getComputedStyle(handle);
    let override = Drag.overrideCursor(style.cursor, this._document);
    this._pressData = { handle, deltaX, deltaY, override };
  }
  /**
   * Handle the `'pointermove'` event for the dock panel.
   */
  _evtPointerMove(event) {
    if (!this._pressData) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    let rect = this.node.getBoundingClientRect();
    let xPos = event.clientX - rect.left - this._pressData.deltaX;
    let yPos = event.clientY - rect.top - this._pressData.deltaY;
    let layout = this.layout;
    layout.moveHandle(this._pressData.handle, xPos, yPos);
  }
  /**
   * Handle the `'pointerup'` event for the dock panel.
   */
  _evtPointerUp(event) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this._releaseMouse();
    import_messaging.MessageLoop.postMessage(this, Private$5.LayoutModified);
  }
  /**
   * Release the mouse grab for the dock panel.
   */
  _releaseMouse() {
    if (!this._pressData) {
      return;
    }
    this._pressData.override.dispose();
    this._pressData = null;
    this._document.removeEventListener("keydown", this, true);
    this._document.removeEventListener("pointerup", this, true);
    this._document.removeEventListener("pointermove", this, true);
    this._document.removeEventListener("contextmenu", this, true);
  }
  /**
   * Show the overlay indicator at the given client position.
   *
   * Returns the drop zone at the specified client position.
   *
   * #### Notes
   * If the position is not over a valid zone, the overlay is hidden.
   */
  _showOverlay(clientX, clientY) {
    let { zone, target } = Private$5.findDropTarget(this, clientX, clientY, this._edges);
    if (zone === "invalid") {
      this.overlay.hide(100);
      return zone;
    }
    let top;
    let left;
    let right;
    let bottom;
    let box = import_domutils2.ElementExt.boxSizing(this.node);
    let rect = this.node.getBoundingClientRect();
    switch (zone) {
      case "root-all":
        top = box.paddingTop;
        left = box.paddingLeft;
        right = box.paddingRight;
        bottom = box.paddingBottom;
        break;
      case "root-top":
        top = box.paddingTop;
        left = box.paddingLeft;
        right = box.paddingRight;
        bottom = rect.height * Private$5.GOLDEN_RATIO;
        break;
      case "root-left":
        top = box.paddingTop;
        left = box.paddingLeft;
        right = rect.width * Private$5.GOLDEN_RATIO;
        bottom = box.paddingBottom;
        break;
      case "root-right":
        top = box.paddingTop;
        left = rect.width * Private$5.GOLDEN_RATIO;
        right = box.paddingRight;
        bottom = box.paddingBottom;
        break;
      case "root-bottom":
        top = rect.height * Private$5.GOLDEN_RATIO;
        left = box.paddingLeft;
        right = box.paddingRight;
        bottom = box.paddingBottom;
        break;
      case "widget-all":
        top = target.top;
        left = target.left;
        right = target.right;
        bottom = target.bottom;
        break;
      case "widget-top":
        top = target.top;
        left = target.left;
        right = target.right;
        bottom = target.bottom + target.height / 2;
        break;
      case "widget-left":
        top = target.top;
        left = target.left;
        right = target.right + target.width / 2;
        bottom = target.bottom;
        break;
      case "widget-right":
        top = target.top;
        left = target.left + target.width / 2;
        right = target.right;
        bottom = target.bottom;
        break;
      case "widget-bottom":
        top = target.top + target.height / 2;
        left = target.left;
        right = target.right;
        bottom = target.bottom;
        break;
      case "widget-tab": {
        const tabHeight = target.tabBar.node.getBoundingClientRect().height;
        top = target.top;
        left = target.left;
        right = target.right;
        bottom = target.bottom + target.height - tabHeight;
        break;
      }
      default:
        throw "unreachable";
    }
    this.overlay.show({ top, left, right, bottom });
    return zone;
  }
  /**
   * Create a new tab bar for use by the panel.
   */
  _createTabBar() {
    let tabBar = this._renderer.createTabBar(this._document);
    Private$5.isGeneratedTabBarProperty.set(tabBar, true);
    if (this._mode === "single-document") {
      tabBar.hide();
    }
    tabBar.tabsMovable = this._tabsMovable;
    tabBar.allowDeselect = false;
    tabBar.addButtonEnabled = this._addButtonEnabled;
    tabBar.removeBehavior = "select-previous-tab";
    tabBar.insertBehavior = "select-tab-if-needed";
    tabBar.tabMoved.connect(this._onTabMoved, this);
    tabBar.currentChanged.connect(this._onCurrentChanged, this);
    tabBar.tabCloseRequested.connect(this._onTabCloseRequested, this);
    tabBar.tabDetachRequested.connect(this._onTabDetachRequested, this);
    tabBar.tabActivateRequested.connect(this._onTabActivateRequested, this);
    tabBar.addRequested.connect(this._onTabAddRequested, this);
    return tabBar;
  }
  /**
   * Create a new handle for use by the panel.
   */
  _createHandle() {
    return this._renderer.createHandle();
  }
  /**
   * Handle the `tabMoved` signal from a tab bar.
   */
  _onTabMoved() {
    import_messaging.MessageLoop.postMessage(this, Private$5.LayoutModified);
  }
  /**
   * Handle the `currentChanged` signal from a tab bar.
   */
  _onCurrentChanged(sender, args) {
    let { previousTitle, currentTitle } = args;
    if (previousTitle) {
      previousTitle.owner.hide();
    }
    if (currentTitle) {
      currentTitle.owner.show();
    }
    if (import_domutils2.Platform.IS_EDGE || import_domutils2.Platform.IS_IE) {
      import_messaging.MessageLoop.flush();
    }
    import_messaging.MessageLoop.postMessage(this, Private$5.LayoutModified);
  }
  /**
   * Handle the `addRequested` signal from a tab bar.
   */
  _onTabAddRequested(sender) {
    this._addRequested.emit(sender);
  }
  /**
   * Handle the `tabActivateRequested` signal from a tab bar.
   */
  _onTabActivateRequested(sender, args) {
    args.title.owner.activate();
  }
  /**
   * Handle the `tabCloseRequested` signal from a tab bar.
   */
  _onTabCloseRequested(sender, args) {
    args.title.owner.close();
  }
  /**
   * Handle the `tabDetachRequested` signal from a tab bar.
   */
  _onTabDetachRequested(sender, args) {
    if (this._drag) {
      return;
    }
    sender.releaseMouse();
    let { title, tab, clientX, clientY, offset } = args;
    let mimeData = new import_coreutils4.MimeData();
    let factory = () => title.owner;
    mimeData.setData("application/vnd.lumino.widget-factory", factory);
    let dragImage = tab.cloneNode(true);
    if (offset) {
      dragImage.style.top = `-${offset.y}px`;
      dragImage.style.left = `-${offset.x}px`;
    }
    this._drag = new Drag({
      document: this._document,
      mimeData,
      dragImage,
      proposedAction: "move",
      supportedActions: "move",
      source: this
    });
    tab.classList.add("lm-mod-hidden");
    let cleanup = () => {
      this._drag = null;
      tab.classList.remove("lm-mod-hidden");
    };
    this._drag.start(clientX, clientY).then(cleanup);
  }
};
(function(DockPanel2) {
  class Overlay {
    /**
     * Construct a new overlay.
     */
    constructor() {
      this._timer = -1;
      this._hidden = true;
      this.node = document.createElement("div");
      this.node.classList.add("lm-DockPanel-overlay");
      this.node.classList.add("lm-mod-hidden");
      this.node.style.position = "absolute";
      this.node.style.contain = "strict";
    }
    /**
     * Show the overlay using the given overlay geometry.
     *
     * @param geo - The desired geometry for the overlay.
     */
    show(geo) {
      let style = this.node.style;
      style.top = `${geo.top}px`;
      style.left = `${geo.left}px`;
      style.right = `${geo.right}px`;
      style.bottom = `${geo.bottom}px`;
      clearTimeout(this._timer);
      this._timer = -1;
      if (!this._hidden) {
        return;
      }
      this._hidden = false;
      this.node.classList.remove("lm-mod-hidden");
    }
    /**
     * Hide the overlay node.
     *
     * @param delay - The delay (in ms) before hiding the overlay.
     *   A delay value <= 0 will hide the overlay immediately.
     */
    hide(delay) {
      if (this._hidden) {
        return;
      }
      if (delay <= 0) {
        clearTimeout(this._timer);
        this._timer = -1;
        this._hidden = true;
        this.node.classList.add("lm-mod-hidden");
        return;
      }
      if (this._timer !== -1) {
        return;
      }
      this._timer = window.setTimeout(() => {
        this._timer = -1;
        this._hidden = true;
        this.node.classList.add("lm-mod-hidden");
      }, delay);
    }
  }
  DockPanel2.Overlay = Overlay;
  class Renderer {
    /**
     * Create a new tab bar for use with a dock panel.
     *
     * @returns A new tab bar for a dock panel.
     */
    createTabBar(document2) {
      let bar = new TabBar({ document: document2 });
      bar.addClass("lm-DockPanel-tabBar");
      return bar;
    }
    /**
     * Create a new handle node for use with a dock panel.
     *
     * @returns A new handle node for a dock panel.
     */
    createHandle() {
      let handle = document.createElement("div");
      handle.className = "lm-DockPanel-handle";
      return handle;
    }
  }
  DockPanel2.Renderer = Renderer;
  DockPanel2.defaultRenderer = new Renderer();
})(DockPanel || (DockPanel = {}));
var Private$5;
(function(Private6) {
  Private6.GOLDEN_RATIO = 0.618;
  Private6.DEFAULT_EDGES = {
    /**
     * The size of the top edge dock zone for the root panel, in pixels.
     * This is different from the others to distinguish between the top
     * tab bar and the top root zone.
     */
    top: 12,
    /**
     * The size of the edge dock zone for the root panel, in pixels.
     */
    right: 40,
    /**
     * The size of the edge dock zone for the root panel, in pixels.
     */
    bottom: 40,
    /**
     * The size of the edge dock zone for the root panel, in pixels.
     */
    left: 40
  };
  Private6.LayoutModified = new import_messaging.ConflatableMessage("layout-modified");
  Private6.isGeneratedTabBarProperty = new import_properties.AttachedProperty({
    name: "isGeneratedTabBar",
    create: () => false
  });
  function createSingleDocumentConfig(panel) {
    if (panel.isEmpty) {
      return { main: null };
    }
    let widgets = Array.from(panel.widgets());
    let selected = panel.selectedWidgets().next().value;
    let currentIndex = selected ? widgets.indexOf(selected) : -1;
    return { main: { type: "tab-area", widgets, currentIndex } };
  }
  Private6.createSingleDocumentConfig = createSingleDocumentConfig;
  function findDropTarget(panel, clientX, clientY, edges) {
    if (!import_domutils2.ElementExt.hitTest(panel.node, clientX, clientY)) {
      return { zone: "invalid", target: null };
    }
    let layout = panel.layout;
    if (layout.isEmpty) {
      return { zone: "root-all", target: null };
    }
    if (panel.mode === "multiple-document") {
      let panelRect = panel.node.getBoundingClientRect();
      let pl = clientX - panelRect.left + 1;
      let pt = clientY - panelRect.top + 1;
      let pr = panelRect.right - clientX;
      let pb = panelRect.bottom - clientY;
      let pd = Math.min(pt, pr, pb, pl);
      switch (pd) {
        case pt:
          if (pt < edges.top) {
            return { zone: "root-top", target: null };
          }
          break;
        case pr:
          if (pr < edges.right) {
            return { zone: "root-right", target: null };
          }
          break;
        case pb:
          if (pb < edges.bottom) {
            return { zone: "root-bottom", target: null };
          }
          break;
        case pl:
          if (pl < edges.left) {
            return { zone: "root-left", target: null };
          }
          break;
        default:
          throw "unreachable";
      }
    }
    let target = layout.hitTestTabAreas(clientX, clientY);
    if (!target) {
      return { zone: "invalid", target: null };
    }
    if (panel.mode === "single-document") {
      return { zone: "widget-all", target };
    }
    let al = target.x - target.left + 1;
    let at = target.y - target.top + 1;
    let ar = target.left + target.width - target.x;
    let ab = target.top + target.height - target.y;
    const tabHeight = target.tabBar.node.getBoundingClientRect().height;
    if (at < tabHeight) {
      return { zone: "widget-tab", target };
    }
    let rx = Math.round(target.width / 3);
    let ry = Math.round(target.height / 3);
    if (al > rx && ar > rx && at > ry && ab > ry) {
      return { zone: "widget-all", target };
    }
    al /= rx;
    at /= ry;
    ar /= rx;
    ab /= ry;
    let ad = Math.min(al, at, ar, ab);
    let zone;
    switch (ad) {
      case al:
        zone = "widget-left";
        break;
      case at:
        zone = "widget-top";
        break;
      case ar:
        zone = "widget-right";
        break;
      case ab:
        zone = "widget-bottom";
        break;
      default:
        throw "unreachable";
    }
    return { zone, target };
  }
  Private6.findDropTarget = findDropTarget;
  function getDropRef(tabBar) {
    if (tabBar.titles.length === 0) {
      return null;
    }
    if (tabBar.currentTitle) {
      return tabBar.currentTitle.owner;
    }
    return tabBar.titles[tabBar.titles.length - 1].owner;
  }
  Private6.getDropRef = getDropRef;
})(Private$5 || (Private$5 = {}));
var GridLayout = class _GridLayout extends Layout {
  /**
   * Construct a new grid layout.
   *
   * @param options - The options for initializing the layout.
   */
  constructor(options = {}) {
    super(options);
    this._dirty = false;
    this._rowSpacing = 4;
    this._columnSpacing = 4;
    this._items = [];
    this._rowStarts = [];
    this._columnStarts = [];
    this._rowSizers = [new BoxSizer()];
    this._columnSizers = [new BoxSizer()];
    this._box = null;
    if (options.rowCount !== void 0) {
      Private$4.reallocSizers(this._rowSizers, options.rowCount);
    }
    if (options.columnCount !== void 0) {
      Private$4.reallocSizers(this._columnSizers, options.columnCount);
    }
    if (options.rowSpacing !== void 0) {
      this._rowSpacing = Private$4.clampValue(options.rowSpacing);
    }
    if (options.columnSpacing !== void 0) {
      this._columnSpacing = Private$4.clampValue(options.columnSpacing);
    }
  }
  /**
   * Dispose of the resources held by the layout.
   */
  dispose() {
    for (const item of this._items) {
      let widget = item.widget;
      item.dispose();
      widget.dispose();
    }
    this._box = null;
    this._items.length = 0;
    this._rowStarts.length = 0;
    this._rowSizers.length = 0;
    this._columnStarts.length = 0;
    this._columnSizers.length = 0;
    super.dispose();
  }
  /**
   * Get the number of rows in the layout.
   */
  get rowCount() {
    return this._rowSizers.length;
  }
  /**
   * Set the number of rows in the layout.
   *
   * #### Notes
   * The minimum row count is `1`.
   */
  set rowCount(value) {
    if (value === this.rowCount) {
      return;
    }
    Private$4.reallocSizers(this._rowSizers, value);
    if (this.parent) {
      this.parent.fit();
    }
  }
  /**
   * Get the number of columns in the layout.
   */
  get columnCount() {
    return this._columnSizers.length;
  }
  /**
   * Set the number of columns in the layout.
   *
   * #### Notes
   * The minimum column count is `1`.
   */
  set columnCount(value) {
    if (value === this.columnCount) {
      return;
    }
    Private$4.reallocSizers(this._columnSizers, value);
    if (this.parent) {
      this.parent.fit();
    }
  }
  /**
   * Get the row spacing for the layout.
   */
  get rowSpacing() {
    return this._rowSpacing;
  }
  /**
   * Set the row spacing for the layout.
   */
  set rowSpacing(value) {
    value = Private$4.clampValue(value);
    if (this._rowSpacing === value) {
      return;
    }
    this._rowSpacing = value;
    if (this.parent) {
      this.parent.fit();
    }
  }
  /**
   * Get the column spacing for the layout.
   */
  get columnSpacing() {
    return this._columnSpacing;
  }
  /**
   * Set the col spacing for the layout.
   */
  set columnSpacing(value) {
    value = Private$4.clampValue(value);
    if (this._columnSpacing === value) {
      return;
    }
    this._columnSpacing = value;
    if (this.parent) {
      this.parent.fit();
    }
  }
  /**
   * Get the stretch factor for a specific row.
   *
   * @param index - The row index of interest.
   *
   * @returns The stretch factor for the row.
   *
   * #### Notes
   * This returns `-1` if the index is out of range.
   */
  rowStretch(index) {
    let sizer = this._rowSizers[index];
    return sizer ? sizer.stretch : -1;
  }
  /**
   * Set the stretch factor for a specific row.
   *
   * @param index - The row index of interest.
   *
   * @param value - The stretch factor for the row.
   *
   * #### Notes
   * This is a no-op if the index is out of range.
   */
  setRowStretch(index, value) {
    let sizer = this._rowSizers[index];
    if (!sizer) {
      return;
    }
    value = Private$4.clampValue(value);
    if (sizer.stretch === value) {
      return;
    }
    sizer.stretch = value;
    if (this.parent) {
      this.parent.update();
    }
  }
  /**
   * Get the stretch factor for a specific column.
   *
   * @param index - The column index of interest.
   *
   * @returns The stretch factor for the column.
   *
   * #### Notes
   * This returns `-1` if the index is out of range.
   */
  columnStretch(index) {
    let sizer = this._columnSizers[index];
    return sizer ? sizer.stretch : -1;
  }
  /**
   * Set the stretch factor for a specific column.
   *
   * @param index - The column index of interest.
   *
   * @param value - The stretch factor for the column.
   *
   * #### Notes
   * This is a no-op if the index is out of range.
   */
  setColumnStretch(index, value) {
    let sizer = this._columnSizers[index];
    if (!sizer) {
      return;
    }
    value = Private$4.clampValue(value);
    if (sizer.stretch === value) {
      return;
    }
    sizer.stretch = value;
    if (this.parent) {
      this.parent.update();
    }
  }
  /**
   * Create an iterator over the widgets in the layout.
   *
   * @returns A new iterator over the widgets in the layout.
   */
  *[Symbol.iterator]() {
    for (const item of this._items) {
      yield item.widget;
    }
  }
  /**
   * Add a widget to the grid layout.
   *
   * @param widget - The widget to add to the layout.
   *
   * #### Notes
   * If the widget is already contained in the layout, this is no-op.
   */
  addWidget(widget) {
    let i = import_algorithm2.ArrayExt.findFirstIndex(this._items, (it) => it.widget === widget);
    if (i !== -1) {
      return;
    }
    this._items.push(new LayoutItem(widget));
    if (this.parent) {
      this.attachWidget(widget);
    }
  }
  /**
   * Remove a widget from the grid layout.
   *
   * @param widget - The widget to remove from the layout.
   *
   * #### Notes
   * A widget is automatically removed from the layout when its `parent`
   * is set to `null`. This method should only be invoked directly when
   * removing a widget from a layout which has yet to be installed on a
   * parent widget.
   *
   * This method does *not* modify the widget's `parent`.
   */
  removeWidget(widget) {
    let i = import_algorithm2.ArrayExt.findFirstIndex(this._items, (it) => it.widget === widget);
    if (i === -1) {
      return;
    }
    let item = import_algorithm2.ArrayExt.removeAt(this._items, i);
    if (this.parent) {
      this.detachWidget(widget);
    }
    item.dispose();
  }
  /**
   * Perform layout initialization which requires the parent widget.
   */
  init() {
    super.init();
    for (const widget of this) {
      this.attachWidget(widget);
    }
  }
  /**
   * Attach a widget to the parent's DOM node.
   *
   * @param widget - The widget to attach to the parent.
   */
  attachWidget(widget) {
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.BeforeAttach);
    }
    this.parent.node.appendChild(widget.node);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.AfterAttach);
    }
    this.parent.fit();
  }
  /**
   * Detach a widget from the parent's DOM node.
   *
   * @param widget - The widget to detach from the parent.
   */
  detachWidget(widget) {
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.BeforeDetach);
    }
    this.parent.node.removeChild(widget.node);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.AfterDetach);
    }
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'before-show'` message.
   */
  onBeforeShow(msg) {
    super.onBeforeShow(msg);
    this.parent.update();
  }
  /**
   * A message handler invoked on a `'before-attach'` message.
   */
  onBeforeAttach(msg) {
    super.onBeforeAttach(msg);
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'child-shown'` message.
   */
  onChildShown(msg) {
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'child-hidden'` message.
   */
  onChildHidden(msg) {
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'resize'` message.
   */
  onResize(msg) {
    if (this.parent.isVisible) {
      this._update(msg.width, msg.height);
    }
  }
  /**
   * A message handler invoked on an `'update-request'` message.
   */
  onUpdateRequest(msg) {
    if (this.parent.isVisible) {
      this._update(-1, -1);
    }
  }
  /**
   * A message handler invoked on a `'fit-request'` message.
   */
  onFitRequest(msg) {
    if (this.parent.isAttached) {
      this._fit();
    }
  }
  /**
   * Fit the layout to the total size required by the widgets.
   */
  _fit() {
    for (let i = 0, n = this.rowCount; i < n; ++i) {
      this._rowSizers[i].minSize = 0;
    }
    for (let i = 0, n = this.columnCount; i < n; ++i) {
      this._columnSizers[i].minSize = 0;
    }
    let items = this._items.filter((it) => !it.isHidden);
    for (let i = 0, n = items.length; i < n; ++i) {
      items[i].fit();
    }
    let maxRow = this.rowCount - 1;
    let maxCol = this.columnCount - 1;
    items.sort(Private$4.rowSpanCmp);
    for (let i = 0, n = items.length; i < n; ++i) {
      let item = items[i];
      let config = _GridLayout.getCellConfig(item.widget);
      let r1 = Math.min(config.row, maxRow);
      let r2 = Math.min(config.row + config.rowSpan - 1, maxRow);
      Private$4.distributeMin(this._rowSizers, r1, r2, item.minHeight);
    }
    items.sort(Private$4.columnSpanCmp);
    for (let i = 0, n = items.length; i < n; ++i) {
      let item = items[i];
      let config = _GridLayout.getCellConfig(item.widget);
      let c1 = Math.min(config.column, maxCol);
      let c2 = Math.min(config.column + config.columnSpan - 1, maxCol);
      Private$4.distributeMin(this._columnSizers, c1, c2, item.minWidth);
    }
    if (this.fitPolicy === "set-no-constraint") {
      import_messaging.MessageLoop.sendMessage(this.parent, Widget.Msg.UpdateRequest);
      return;
    }
    let minH = maxRow * this._rowSpacing;
    let minW = maxCol * this._columnSpacing;
    for (let i = 0, n = this.rowCount; i < n; ++i) {
      minH += this._rowSizers[i].minSize;
    }
    for (let i = 0, n = this.columnCount; i < n; ++i) {
      minW += this._columnSizers[i].minSize;
    }
    let box = this._box = import_domutils2.ElementExt.boxSizing(this.parent.node);
    minW += box.horizontalSum;
    minH += box.verticalSum;
    let style = this.parent.node.style;
    style.minWidth = `${minW}px`;
    style.minHeight = `${minH}px`;
    this._dirty = true;
    if (this.parent.parent) {
      import_messaging.MessageLoop.sendMessage(this.parent.parent, Widget.Msg.FitRequest);
    }
    if (this._dirty) {
      import_messaging.MessageLoop.sendMessage(this.parent, Widget.Msg.UpdateRequest);
    }
  }
  /**
   * Update the layout position and size of the widgets.
   *
   * The parent offset dimensions should be `-1` if unknown.
   */
  _update(offsetWidth, offsetHeight) {
    this._dirty = false;
    if (offsetWidth < 0) {
      offsetWidth = this.parent.node.offsetWidth;
    }
    if (offsetHeight < 0) {
      offsetHeight = this.parent.node.offsetHeight;
    }
    if (!this._box) {
      this._box = import_domutils2.ElementExt.boxSizing(this.parent.node);
    }
    let top = this._box.paddingTop;
    let left = this._box.paddingLeft;
    let width = offsetWidth - this._box.horizontalSum;
    let height = offsetHeight - this._box.verticalSum;
    let maxRow = this.rowCount - 1;
    let maxCol = this.columnCount - 1;
    let fixedRowSpace = maxRow * this._rowSpacing;
    let fixedColSpace = maxCol * this._columnSpacing;
    BoxEngine.calc(this._rowSizers, Math.max(0, height - fixedRowSpace));
    BoxEngine.calc(this._columnSizers, Math.max(0, width - fixedColSpace));
    for (let i = 0, pos = top, n = this.rowCount; i < n; ++i) {
      this._rowStarts[i] = pos;
      pos += this._rowSizers[i].size + this._rowSpacing;
    }
    for (let i = 0, pos = left, n = this.columnCount; i < n; ++i) {
      this._columnStarts[i] = pos;
      pos += this._columnSizers[i].size + this._columnSpacing;
    }
    for (let i = 0, n = this._items.length; i < n; ++i) {
      let item = this._items[i];
      if (item.isHidden) {
        continue;
      }
      let config = _GridLayout.getCellConfig(item.widget);
      let r1 = Math.min(config.row, maxRow);
      let c1 = Math.min(config.column, maxCol);
      let r2 = Math.min(config.row + config.rowSpan - 1, maxRow);
      let c2 = Math.min(config.column + config.columnSpan - 1, maxCol);
      let x = this._columnStarts[c1];
      let y = this._rowStarts[r1];
      let w = this._columnStarts[c2] + this._columnSizers[c2].size - x;
      let h2 = this._rowStarts[r2] + this._rowSizers[r2].size - y;
      item.update(x, y, w, h2);
    }
  }
};
(function(GridLayout2) {
  function getCellConfig(widget) {
    return Private$4.cellConfigProperty.get(widget);
  }
  GridLayout2.getCellConfig = getCellConfig;
  function setCellConfig(widget, value) {
    Private$4.cellConfigProperty.set(widget, Private$4.normalizeConfig(value));
  }
  GridLayout2.setCellConfig = setCellConfig;
})(GridLayout || (GridLayout = {}));
var Private$4;
(function(Private6) {
  Private6.cellConfigProperty = new import_properties.AttachedProperty({
    name: "cellConfig",
    create: () => ({ row: 0, column: 0, rowSpan: 1, columnSpan: 1 }),
    changed: onChildCellConfigChanged
  });
  function normalizeConfig(config) {
    let row = Math.max(0, Math.floor(config.row || 0));
    let column = Math.max(0, Math.floor(config.column || 0));
    let rowSpan = Math.max(1, Math.floor(config.rowSpan || 0));
    let columnSpan = Math.max(1, Math.floor(config.columnSpan || 0));
    return { row, column, rowSpan, columnSpan };
  }
  Private6.normalizeConfig = normalizeConfig;
  function clampValue(value) {
    return Math.max(0, Math.floor(value));
  }
  Private6.clampValue = clampValue;
  function rowSpanCmp(a, b) {
    let c1 = Private6.cellConfigProperty.get(a.widget);
    let c2 = Private6.cellConfigProperty.get(b.widget);
    return c1.rowSpan - c2.rowSpan;
  }
  Private6.rowSpanCmp = rowSpanCmp;
  function columnSpanCmp(a, b) {
    let c1 = Private6.cellConfigProperty.get(a.widget);
    let c2 = Private6.cellConfigProperty.get(b.widget);
    return c1.columnSpan - c2.columnSpan;
  }
  Private6.columnSpanCmp = columnSpanCmp;
  function reallocSizers(sizers, count) {
    count = Math.max(1, Math.floor(count));
    while (sizers.length < count) {
      sizers.push(new BoxSizer());
    }
    if (sizers.length > count) {
      sizers.length = count;
    }
  }
  Private6.reallocSizers = reallocSizers;
  function distributeMin(sizers, i1, i2, minSize) {
    if (i2 < i1) {
      return;
    }
    if (i1 === i2) {
      let sizer = sizers[i1];
      sizer.minSize = Math.max(sizer.minSize, minSize);
      return;
    }
    let totalMin = 0;
    for (let i = i1; i <= i2; ++i) {
      totalMin += sizers[i].minSize;
    }
    if (totalMin >= minSize) {
      return;
    }
    let portion = (minSize - totalMin) / (i2 - i1 + 1);
    for (let i = i1; i <= i2; ++i) {
      sizers[i].minSize += portion;
    }
  }
  Private6.distributeMin = distributeMin;
  function onChildCellConfigChanged(child) {
    if (child.parent && child.parent.layout instanceof GridLayout) {
      child.parent.fit();
    }
  }
})(Private$4 || (Private$4 = {}));
var MenuBar = class _MenuBar extends Widget {
  /**
   * Construct a new menu bar.
   *
   * @param options - The options for initializing the menu bar.
   */
  constructor(options = {}) {
    super({ node: Private$3.createNode() });
    this._activeIndex = -1;
    this._tabFocusIndex = 0;
    this._menus = [];
    this._childMenu = null;
    this._overflowMenu = null;
    this._menuItemSizes = [];
    this._overflowIndex = -1;
    this.addClass("lm-MenuBar");
    this.setFlag(Widget.Flag.DisallowLayout);
    this.renderer = options.renderer || _MenuBar.defaultRenderer;
    this._forceItemsPosition = options.forceItemsPosition || {
      forceX: true,
      forceY: true
    };
    this._overflowMenuOptions = options.overflowMenuOptions || {
      isVisible: true
    };
  }
  /**
   * Dispose of the resources held by the widget.
   */
  dispose() {
    this._closeChildMenu();
    this._menus.length = 0;
    super.dispose();
  }
  /**
   * The child menu of the menu bar.
   *
   * #### Notes
   * This will be `null` if the menu bar does not have an open menu.
   */
  get childMenu() {
    return this._childMenu;
  }
  /**
   * The overflow index of the menu bar.
   */
  get overflowIndex() {
    return this._overflowIndex;
  }
  /**
   * The overflow menu of the menu bar.
   */
  get overflowMenu() {
    return this._overflowMenu;
  }
  /**
   * Get the menu bar content node.
   *
   * #### Notes
   * This is the node which holds the menu title nodes.
   *
   * Modifying this node directly can lead to undefined behavior.
   */
  get contentNode() {
    return this.node.getElementsByClassName("lm-MenuBar-content")[0];
  }
  /**
   * Get the currently active menu.
   */
  get activeMenu() {
    return this._menus[this._activeIndex] || null;
  }
  /**
   * Set the currently active menu.
   *
   * #### Notes
   * If the menu does not exist, the menu will be set to `null`.
   */
  set activeMenu(value) {
    this.activeIndex = value ? this._menus.indexOf(value) : -1;
  }
  /**
   * Get the index of the currently active menu.
   *
   * #### Notes
   * This will be `-1` if no menu is active.
   */
  get activeIndex() {
    return this._activeIndex;
  }
  /**
   * Set the index of the currently active menu.
   *
   * #### Notes
   * If the menu cannot be activated, the index will be set to `-1`.
   */
  set activeIndex(value) {
    if (value < 0 || value >= this._menus.length) {
      value = -1;
    }
    if (value > -1 && this._menus[value].items.length === 0) {
      value = -1;
    }
    if (this._activeIndex === value) {
      return;
    }
    this._activeIndex = value;
    this.update();
  }
  /**
   * A read-only array of the menus in the menu bar.
   */
  get menus() {
    return this._menus;
  }
  /**
   * Open the active menu and activate its first menu item.
   *
   * #### Notes
   * If there is no active menu, this is a no-op.
   */
  openActiveMenu() {
    if (this._activeIndex === -1) {
      return;
    }
    this._openChildMenu();
    if (this._childMenu) {
      this._childMenu.activeIndex = -1;
      this._childMenu.activateNextItem();
    }
  }
  /**
   * Add a menu to the end of the menu bar.
   *
   * @param menu - The menu to add to the menu bar.
   *
   * #### Notes
   * If the menu is already added to the menu bar, it will be moved.
   */
  addMenu(menu, update = true) {
    this.insertMenu(this._menus.length, menu, update);
  }
  /**
   * Insert a menu into the menu bar at the specified index.
   *
   * @param index - The index at which to insert the menu.
   *
   * @param menu - The menu to insert into the menu bar.
   *
   * #### Notes
   * The index will be clamped to the bounds of the menus.
   *
   * If the menu is already added to the menu bar, it will be moved.
   */
  insertMenu(index, menu, update = true) {
    this._closeChildMenu();
    let i = this._menus.indexOf(menu);
    let j = Math.max(0, Math.min(index, this._menus.length));
    if (i === -1) {
      import_algorithm2.ArrayExt.insert(this._menus, j, menu);
      menu.addClass("lm-MenuBar-menu");
      menu.aboutToClose.connect(this._onMenuAboutToClose, this);
      menu.menuRequested.connect(this._onMenuMenuRequested, this);
      menu.title.changed.connect(this._onTitleChanged, this);
      if (update) {
        this.update();
      }
      return;
    }
    if (j === this._menus.length) {
      j--;
    }
    if (i === j) {
      return;
    }
    import_algorithm2.ArrayExt.move(this._menus, i, j);
    if (update) {
      this.update();
    }
  }
  /**
   * Remove a menu from the menu bar.
   *
   * @param menu - The menu to remove from the menu bar.
   *
   * #### Notes
   * This is a no-op if the menu is not in the menu bar.
   */
  removeMenu(menu, update = true) {
    this.removeMenuAt(this._menus.indexOf(menu), update);
  }
  /**
   * Remove the menu at a given index from the menu bar.
   *
   * @param index - The index of the menu to remove.
   *
   * #### Notes
   * This is a no-op if the index is out of range.
   */
  removeMenuAt(index, update = true) {
    this._closeChildMenu();
    let menu = import_algorithm2.ArrayExt.removeAt(this._menus, index);
    if (!menu) {
      return;
    }
    menu.aboutToClose.disconnect(this._onMenuAboutToClose, this);
    menu.menuRequested.disconnect(this._onMenuMenuRequested, this);
    menu.title.changed.disconnect(this._onTitleChanged, this);
    menu.removeClass("lm-MenuBar-menu");
    if (update) {
      this.update();
    }
  }
  /**
   * Remove all menus from the menu bar.
   */
  clearMenus() {
    if (this._menus.length === 0) {
      return;
    }
    this._closeChildMenu();
    for (let menu of this._menus) {
      menu.aboutToClose.disconnect(this._onMenuAboutToClose, this);
      menu.menuRequested.disconnect(this._onMenuMenuRequested, this);
      menu.title.changed.disconnect(this._onTitleChanged, this);
      menu.removeClass("lm-MenuBar-menu");
    }
    this._menus.length = 0;
    this.update();
  }
  /**
   * Handle the DOM events for the menu bar.
   *
   * @param event - The DOM event sent to the menu bar.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the menu bar's DOM nodes. It
   * should not be called directly by user code.
   */
  handleEvent(event) {
    switch (event.type) {
      case "keydown":
        this._evtKeyDown(event);
        break;
      case "pointerdown":
        this._evtPointerDown(event);
        break;
      case "pointermove":
      case "pointerleave":
        this._evtPointerMove(event);
        break;
      case "focusout":
        this._evtFocusOut(event);
        break;
      case "contextmenu":
        event.preventDefault();
        event.stopPropagation();
        break;
    }
  }
  /**
   * A message handler invoked on a `'before-attach'` message.
   */
  onBeforeAttach(msg) {
    this.node.addEventListener("keydown", this);
    this.node.addEventListener("pointerdown", this);
    this.node.addEventListener("pointermove", this);
    this.node.addEventListener("pointerleave", this);
    this.node.addEventListener("focusout", this);
    this.node.addEventListener("contextmenu", this);
  }
  /**
   * A message handler invoked on an `'after-detach'` message.
   */
  onAfterDetach(msg) {
    this.node.removeEventListener("keydown", this);
    this.node.removeEventListener("pointerdown", this);
    this.node.removeEventListener("pointermove", this);
    this.node.removeEventListener("pointerleave", this);
    this.node.removeEventListener("focusout", this);
    this.node.removeEventListener("contextmenu", this);
    this._closeChildMenu();
  }
  /**
   * A message handler invoked on an `'activate-request'` message.
   */
  onActivateRequest(msg) {
    if (this.isAttached) {
      this._focusItemAt(0);
    }
  }
  /**
   * A message handler invoked on a `'resize'` message.
   */
  onResize(msg) {
    this.update();
    super.onResize(msg);
  }
  /**
   * A message handler invoked on an `'update-request'` message.
   */
  onUpdateRequest(msg) {
    var _a;
    let menus = this._menus;
    let renderer = this.renderer;
    let activeIndex = this._activeIndex;
    let tabFocusIndex = this._tabFocusIndex >= 0 && this._tabFocusIndex < menus.length ? this._tabFocusIndex : 0;
    let length = this._overflowIndex > -1 ? this._overflowIndex : menus.length;
    let totalMenuSize = 0;
    let isVisible = false;
    length = this._overflowMenu !== null ? length - 1 : length;
    let content = new Array(length);
    for (let i = 0; i < length; ++i) {
      content[i] = renderer.renderItem({
        title: menus[i].title,
        active: i === activeIndex,
        tabbable: i === tabFocusIndex,
        disabled: menus[i].items.length === 0,
        onfocus: () => {
          this._tabFocusIndex = i;
          this.activeIndex = i;
        }
      });
      totalMenuSize += this._menuItemSizes[i];
      if (menus[i].title.label === this._overflowMenuOptions.title) {
        isVisible = true;
        length--;
      }
    }
    if (this._overflowMenuOptions.isVisible) {
      if (this._overflowIndex > -1 && !isVisible) {
        if (this._overflowMenu === null) {
          const overflowMenuTitle = (_a = this._overflowMenuOptions.title) !== null && _a !== void 0 ? _a : "...";
          this._overflowMenu = new Menu({ commands: new CommandRegistry() });
          this._overflowMenu.title.label = overflowMenuTitle;
          this._overflowMenu.title.mnemonic = 0;
          this.addMenu(this._overflowMenu, false);
        }
        for (let i = menus.length - 2; i >= length; i--) {
          const submenu = this.menus[i];
          submenu.title.mnemonic = 0;
          this._overflowMenu.insertItem(0, {
            type: "submenu",
            submenu
          });
          this.removeMenu(submenu, false);
        }
        content[length] = renderer.renderItem({
          title: this._overflowMenu.title,
          active: length === activeIndex && menus[length].items.length !== 0,
          tabbable: length === tabFocusIndex,
          disabled: menus[length].items.length === 0,
          onfocus: () => {
            this._tabFocusIndex = length;
            this.activeIndex = length;
          }
        });
        length++;
      } else if (this._overflowMenu !== null) {
        let overflowMenuItems = this._overflowMenu.items;
        let screenSize = this.node.offsetWidth;
        let n = this._overflowMenu.items.length;
        for (let i = 0; i < n; ++i) {
          let index = menus.length - 1 - i;
          if (screenSize - totalMenuSize > this._menuItemSizes[index]) {
            let menu = overflowMenuItems[0].submenu;
            this._overflowMenu.removeItemAt(0);
            this.insertMenu(length, menu, false);
            content[length] = renderer.renderItem({
              title: menu.title,
              active: false,
              tabbable: length === tabFocusIndex,
              disabled: menus[length].items.length === 0,
              onfocus: () => {
                this._tabFocusIndex = length;
                this.activeIndex = length;
              }
            });
            length++;
          }
        }
        if (this._overflowMenu.items.length === 0) {
          this.removeMenu(this._overflowMenu, false);
          content.pop();
          this._overflowMenu = null;
          this._overflowIndex = -1;
        }
      }
    }
    import_virtualdom.VirtualDOM.render(content, this.contentNode);
    this._updateOverflowIndex();
  }
  /**
   * Calculate and update the current overflow index.
   */
  _updateOverflowIndex() {
    if (!this._overflowMenuOptions.isVisible) {
      return;
    }
    const itemMenus = this.contentNode.childNodes;
    let screenSize = this.node.offsetWidth;
    let totalMenuSize = 0;
    let index = -1;
    let n = itemMenus.length;
    if (this._menuItemSizes.length == 0) {
      for (let i = 0; i < n; i++) {
        let item = itemMenus[i];
        totalMenuSize += item.offsetWidth;
        this._menuItemSizes.push(item.offsetWidth);
        if (totalMenuSize > screenSize && index === -1) {
          index = i;
        }
      }
    } else {
      for (let i = 0; i < this._menuItemSizes.length; i++) {
        totalMenuSize += this._menuItemSizes[i];
        if (totalMenuSize > screenSize) {
          index = i;
          break;
        }
      }
    }
    this._overflowIndex = index;
  }
  /**
   * Handle the `'keydown'` event for the menu bar.
   *
   * #### Notes
   * All keys are trapped except the tab key that is ignored.
   */
  _evtKeyDown(event) {
    let kc = event.keyCode;
    if (kc === 9) {
      this.activeIndex = -1;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (kc === 13 || kc === 32 || kc === 38 || kc === 40) {
      this.activeIndex = this._tabFocusIndex;
      if (this.activeIndex !== this._tabFocusIndex) {
        return;
      }
      this.openActiveMenu();
      return;
    }
    if (kc === 27) {
      this._closeChildMenu();
      this._focusItemAt(this.activeIndex);
      return;
    }
    if (kc === 37 || kc === 39) {
      let direction = kc === 37 ? -1 : 1;
      let start2 = this._tabFocusIndex + direction;
      let n = this._menus.length;
      for (let i = 0; i < n; i++) {
        let index = (n + start2 + direction * i) % n;
        if (this._menus[index].items.length) {
          this._focusItemAt(index);
          return;
        }
      }
      return;
    }
    let key = getKeyboardLayout().keyForKeydownEvent(event);
    if (!key) {
      return;
    }
    let start = this._activeIndex + 1;
    let result = Private$3.findMnemonic(this._menus, key, start);
    if (result.index !== -1 && !result.multiple) {
      this.activeIndex = result.index;
      this.openActiveMenu();
    } else if (result.index !== -1) {
      this.activeIndex = result.index;
      this._focusItemAt(this.activeIndex);
    } else if (result.auto !== -1) {
      this.activeIndex = result.auto;
      this._focusItemAt(this.activeIndex);
    }
  }
  /**
   * Handle the `'pointerdown'` event for the menu bar.
   */
  _evtPointerDown(event) {
    if (!import_domutils2.ElementExt.hitTest(this.node, event.clientX, event.clientY)) {
      return;
    }
    event.stopPropagation();
    event.stopImmediatePropagation();
    let index = import_algorithm2.ArrayExt.findFirstIndex(this.contentNode.children, (node) => {
      return import_domutils2.ElementExt.hitTest(node, event.clientX, event.clientY);
    });
    if (index === -1) {
      this._closeChildMenu();
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (this._childMenu) {
      this._closeChildMenu();
      this.activeIndex = index;
    } else {
      event.preventDefault();
      const position = this._positionForMenu(index);
      Menu.saveWindowData();
      this.activeIndex = index;
      this._openChildMenu(position);
    }
  }
  /**
   * Handle the `'pointermove'` event for the menu bar.
   */
  _evtPointerMove(event) {
    let index = import_algorithm2.ArrayExt.findFirstIndex(this.contentNode.children, (node) => {
      return import_domutils2.ElementExt.hitTest(node, event.clientX, event.clientY);
    });
    if (index === this._activeIndex) {
      return;
    }
    if (index === -1 && this._childMenu) {
      return;
    }
    const position = index >= 0 && this._childMenu ? this._positionForMenu(index) : null;
    Menu.saveWindowData();
    this.activeIndex = index;
    if (position) {
      this._openChildMenu(position);
    }
  }
  /**
   * Find initial position for the menu based on menubar item position.
   *
   * NOTE: this should be called before updating active index to avoid
   * an additional layout and style invalidation as changing active
   * index modifies DOM.
   */
  _positionForMenu(index) {
    let itemNode = this.contentNode.children[index];
    let { left, bottom } = itemNode.getBoundingClientRect();
    return {
      top: bottom,
      left
    };
  }
  /**
   * Handle the `'focusout'` event for the menu bar.
   */
  _evtFocusOut(event) {
    if (!this._childMenu && !this.node.contains(event.relatedTarget)) {
      this.activeIndex = -1;
    }
  }
  /**
   * Focus an item in the menu bar.
   *
   * #### Notes
   * Does not open the associated menu.
   */
  _focusItemAt(index) {
    const itemNode = this.contentNode.childNodes[index];
    if (itemNode) {
      itemNode.focus();
    }
  }
  /**
   * Open the child menu at the active index immediately.
   *
   * If a different child menu is already open, it will be closed,
   * even if there is no active menu.
   */
  _openChildMenu(options = {}) {
    let newMenu = this.activeMenu;
    if (!newMenu) {
      this._closeChildMenu();
      return;
    }
    let oldMenu = this._childMenu;
    if (oldMenu === newMenu) {
      return;
    }
    this._childMenu = newMenu;
    if (oldMenu) {
      oldMenu.close();
    } else {
      document.addEventListener("pointerdown", this, true);
    }
    this._tabFocusIndex = this.activeIndex;
    import_messaging.MessageLoop.sendMessage(this, Widget.Msg.UpdateRequest);
    let { left, top } = options;
    if (typeof left === "undefined" || typeof top === "undefined") {
      ({ left, top } = this._positionForMenu(this._activeIndex));
    }
    if (!oldMenu) {
      this.addClass("lm-mod-active");
    }
    if (newMenu.items.length > 0) {
      newMenu.open(left, top, this._forceItemsPosition);
    }
  }
  /**
   * Close the child menu immediately.
   *
   * This is a no-op if a child menu is not open.
   */
  _closeChildMenu() {
    if (!this._childMenu) {
      return;
    }
    this.removeClass("lm-mod-active");
    document.removeEventListener("pointerdown", this, true);
    let menu = this._childMenu;
    this._childMenu = null;
    menu.close();
    this.activeIndex = -1;
  }
  /**
   * Handle the `aboutToClose` signal of a menu.
   */
  _onMenuAboutToClose(sender) {
    if (sender !== this._childMenu) {
      return;
    }
    this.removeClass("lm-mod-active");
    document.removeEventListener("pointerdown", this, true);
    this._childMenu = null;
    this.activeIndex = -1;
  }
  /**
   * Handle the `menuRequested` signal of a child menu.
   */
  _onMenuMenuRequested(sender, args) {
    if (sender !== this._childMenu) {
      return;
    }
    let i = this._activeIndex;
    let n = this._menus.length;
    switch (args) {
      case "next":
        this.activeIndex = i === n - 1 ? 0 : i + 1;
        break;
      case "previous":
        this.activeIndex = i === 0 ? n - 1 : i - 1;
        break;
    }
    this.openActiveMenu();
  }
  /**
   * Handle the `changed` signal of a title object.
   */
  _onTitleChanged() {
    this.update();
  }
};
(function(MenuBar2) {
  class Renderer {
    /**
     * Render the virtual element for a menu bar item.
     *
     * @param data - The data to use for rendering the item.
     *
     * @returns A virtual element representing the item.
     */
    renderItem(data) {
      let className = this.createItemClass(data);
      let dataset = this.createItemDataset(data);
      let aria = this.createItemARIA(data);
      return import_virtualdom.h.li({
        className,
        dataset,
        ...data.disabled ? {} : { tabindex: data.tabbable ? "0" : "-1" },
        onfocus: data.onfocus,
        ...aria
      }, this.renderIcon(data), this.renderLabel(data));
    }
    /**
     * Render the icon element for a menu bar item.
     *
     * @param data - The data to use for rendering the icon.
     *
     * @returns A virtual element representing the item icon.
     */
    renderIcon(data) {
      let className = this.createIconClass(data);
      return import_virtualdom.h.div({ className }, data.title.icon, data.title.iconLabel);
    }
    /**
     * Render the label element for a menu item.
     *
     * @param data - The data to use for rendering the label.
     *
     * @returns A virtual element representing the item label.
     */
    renderLabel(data) {
      let content = this.formatLabel(data);
      return import_virtualdom.h.div({ className: "lm-MenuBar-itemLabel" }, content);
    }
    /**
     * Create the class name for the menu bar item.
     *
     * @param data - The data to use for the class name.
     *
     * @returns The full class name for the menu item.
     */
    createItemClass(data) {
      let name = "lm-MenuBar-item";
      if (data.title.className) {
        name += ` ${data.title.className}`;
      }
      if (data.active && !data.disabled) {
        name += " lm-mod-active";
      }
      return name;
    }
    /**
     * Create the dataset for a menu bar item.
     *
     * @param data - The data to use for the item.
     *
     * @returns The dataset for the menu bar item.
     */
    createItemDataset(data) {
      return data.title.dataset;
    }
    /**
     * Create the aria attributes for menu bar item.
     *
     * @param data - The data to use for the aria attributes.
     *
     * @returns The aria attributes object for the item.
     */
    createItemARIA(data) {
      return {
        role: "menuitem",
        "aria-haspopup": "true",
        "aria-disabled": data.disabled ? "true" : "false"
      };
    }
    /**
     * Create the class name for the menu bar item icon.
     *
     * @param data - The data to use for the class name.
     *
     * @returns The full class name for the item icon.
     */
    createIconClass(data) {
      let name = "lm-MenuBar-itemIcon";
      let extra = data.title.iconClass;
      return extra ? `${name} ${extra}` : name;
    }
    /**
     * Create the render content for the label node.
     *
     * @param data - The data to use for the label content.
     *
     * @returns The content to add to the label node.
     */
    formatLabel(data) {
      let { label, mnemonic } = data.title;
      if (mnemonic < 0 || mnemonic >= label.length) {
        return label;
      }
      let prefix = label.slice(0, mnemonic);
      let suffix = label.slice(mnemonic + 1);
      let char = label[mnemonic];
      let span = import_virtualdom.h.span({ className: "lm-MenuBar-itemMnemonic" }, char);
      return [prefix, span, suffix];
    }
  }
  MenuBar2.Renderer = Renderer;
  MenuBar2.defaultRenderer = new Renderer();
})(MenuBar || (MenuBar = {}));
var Private$3;
(function(Private6) {
  function createNode() {
    let node = document.createElement("div");
    let content = document.createElement("ul");
    content.className = "lm-MenuBar-content";
    node.appendChild(content);
    content.setAttribute("role", "menubar");
    return node;
  }
  Private6.createNode = createNode;
  function findMnemonic(menus, key, start) {
    let index = -1;
    let auto = -1;
    let multiple = false;
    let upperKey = key.toUpperCase();
    for (let i = 0, n = menus.length; i < n; ++i) {
      let k = (i + start) % n;
      let title = menus[k].title;
      if (title.label.length === 0) {
        continue;
      }
      let mn = title.mnemonic;
      if (mn >= 0 && mn < title.label.length) {
        if (title.label[mn].toUpperCase() === upperKey) {
          if (index === -1) {
            index = k;
          } else {
            multiple = true;
          }
        }
        continue;
      }
      if (auto === -1 && title.label[0].toUpperCase() === upperKey) {
        auto = k;
      }
    }
    return { index, multiple, auto };
  }
  Private6.findMnemonic = findMnemonic;
})(Private$3 || (Private$3 = {}));
var Private$2;
(function(Private6) {
  function createNode() {
    let node = document.createElement("div");
    let decrement = document.createElement("div");
    let increment = document.createElement("div");
    let track = document.createElement("div");
    let thumb = document.createElement("div");
    decrement.className = "lm-ScrollBar-button";
    increment.className = "lm-ScrollBar-button";
    decrement.dataset["action"] = "decrement";
    increment.dataset["action"] = "increment";
    track.className = "lm-ScrollBar-track";
    thumb.className = "lm-ScrollBar-thumb";
    track.appendChild(thumb);
    node.appendChild(decrement);
    node.appendChild(track);
    node.appendChild(increment);
    return node;
  }
  Private6.createNode = createNode;
  function findPart(scrollBar, target) {
    if (scrollBar.thumbNode.contains(target)) {
      return "thumb";
    }
    if (scrollBar.trackNode.contains(target)) {
      return "track";
    }
    if (scrollBar.decrementNode.contains(target)) {
      return "decrement";
    }
    if (scrollBar.incrementNode.contains(target)) {
      return "increment";
    }
    return null;
  }
  Private6.findPart = findPart;
})(Private$2 || (Private$2 = {}));
var StackedLayout = class extends PanelLayout {
  constructor(options = {}) {
    super(options);
    this._dirty = false;
    this._items = [];
    this._box = null;
    this._hiddenMode = options.hiddenMode !== void 0 ? options.hiddenMode : Widget.HiddenMode.Display;
  }
  /**
   * The method for hiding widgets.
   *
   * #### Notes
   * If there is only one child widget, `Display` hiding mode will be used
   * regardless of this setting.
   */
  get hiddenMode() {
    return this._hiddenMode;
  }
  /**
   * Set the method for hiding widgets.
   *
   * #### Notes
   * If there is only one child widget, `Display` hiding mode will be used
   * regardless of this setting.
   */
  set hiddenMode(v) {
    if (this._hiddenMode === v) {
      return;
    }
    this._hiddenMode = v;
    if (this.widgets.length > 1) {
      this.widgets.forEach((w) => {
        w.hiddenMode = this._hiddenMode;
      });
    }
  }
  /**
   * Dispose of the resources held by the layout.
   */
  dispose() {
    for (const item of this._items) {
      item.dispose();
    }
    this._box = null;
    this._items.length = 0;
    super.dispose();
  }
  /**
   * Attach a widget to the parent's DOM node.
   *
   * @param index - The current index of the widget in the layout.
   *
   * @param widget - The widget to attach to the parent.
   *
   * #### Notes
   * This is a reimplementation of the superclass method.
   */
  attachWidget(index, widget) {
    if (this._hiddenMode === Widget.HiddenMode.Scale && this._items.length > 0) {
      if (this._items.length === 1) {
        this.widgets[0].hiddenMode = Widget.HiddenMode.Scale;
      }
      widget.hiddenMode = Widget.HiddenMode.Scale;
    } else {
      widget.hiddenMode = Widget.HiddenMode.Display;
    }
    import_algorithm2.ArrayExt.insert(this._items, index, new LayoutItem(widget));
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.BeforeAttach);
    }
    this.parent.node.appendChild(widget.node);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.AfterAttach);
    }
    this.parent.fit();
  }
  /**
   * Move a widget in the parent's DOM node.
   *
   * @param fromIndex - The previous index of the widget in the layout.
   *
   * @param toIndex - The current index of the widget in the layout.
   *
   * @param widget - The widget to move in the parent.
   *
   * #### Notes
   * This is a reimplementation of the superclass method.
   */
  moveWidget(fromIndex, toIndex, widget) {
    import_algorithm2.ArrayExt.move(this._items, fromIndex, toIndex);
    this.parent.update();
  }
  /**
   * Detach a widget from the parent's DOM node.
   *
   * @param index - The previous index of the widget in the layout.
   *
   * @param widget - The widget to detach from the parent.
   *
   * #### Notes
   * This is a reimplementation of the superclass method.
   */
  detachWidget(index, widget) {
    let item = import_algorithm2.ArrayExt.removeAt(this._items, index);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.BeforeDetach);
    }
    this.parent.node.removeChild(widget.node);
    if (this.parent.isAttached) {
      import_messaging.MessageLoop.sendMessage(widget, Widget.Msg.AfterDetach);
    }
    item.widget.node.style.zIndex = "";
    if (this._hiddenMode === Widget.HiddenMode.Scale) {
      widget.hiddenMode = Widget.HiddenMode.Display;
      if (this._items.length === 1) {
        this._items[0].widget.hiddenMode = Widget.HiddenMode.Display;
      }
    }
    item.dispose();
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'before-show'` message.
   */
  onBeforeShow(msg) {
    super.onBeforeShow(msg);
    this.parent.update();
  }
  /**
   * A message handler invoked on a `'before-attach'` message.
   */
  onBeforeAttach(msg) {
    super.onBeforeAttach(msg);
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'child-shown'` message.
   */
  onChildShown(msg) {
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'child-hidden'` message.
   */
  onChildHidden(msg) {
    this.parent.fit();
  }
  /**
   * A message handler invoked on a `'resize'` message.
   */
  onResize(msg) {
    if (this.parent.isVisible) {
      this._update(msg.width, msg.height);
    }
  }
  /**
   * A message handler invoked on an `'update-request'` message.
   */
  onUpdateRequest(msg) {
    if (this.parent.isVisible) {
      this._update(-1, -1);
    }
  }
  /**
   * A message handler invoked on a `'fit-request'` message.
   */
  onFitRequest(msg) {
    if (this.parent.isAttached) {
      this._fit();
    }
  }
  /**
   * Fit the layout to the total size required by the widgets.
   */
  _fit() {
    let minW = 0;
    let minH = 0;
    for (let i = 0, n = this._items.length; i < n; ++i) {
      let item = this._items[i];
      if (item.isHidden) {
        continue;
      }
      item.fit();
      minW = Math.max(minW, item.minWidth);
      minH = Math.max(minH, item.minHeight);
    }
    let box = this._box = import_domutils2.ElementExt.boxSizing(this.parent.node);
    minW += box.horizontalSum;
    minH += box.verticalSum;
    let style = this.parent.node.style;
    style.minWidth = `${minW}px`;
    style.minHeight = `${minH}px`;
    this._dirty = true;
    if (this.parent.parent) {
      import_messaging.MessageLoop.sendMessage(this.parent.parent, Widget.Msg.FitRequest);
    }
    if (this._dirty) {
      import_messaging.MessageLoop.sendMessage(this.parent, Widget.Msg.UpdateRequest);
    }
  }
  /**
   * Update the layout position and size of the widgets.
   *
   * The parent offset dimensions should be `-1` if unknown.
   */
  _update(offsetWidth, offsetHeight) {
    this._dirty = false;
    let nVisible = 0;
    for (let i = 0, n = this._items.length; i < n; ++i) {
      nVisible += +!this._items[i].isHidden;
    }
    if (nVisible === 0) {
      return;
    }
    if (offsetWidth < 0) {
      offsetWidth = this.parent.node.offsetWidth;
    }
    if (offsetHeight < 0) {
      offsetHeight = this.parent.node.offsetHeight;
    }
    if (!this._box) {
      this._box = import_domutils2.ElementExt.boxSizing(this.parent.node);
    }
    let top = this._box.paddingTop;
    let left = this._box.paddingLeft;
    let width = offsetWidth - this._box.horizontalSum;
    let height = offsetHeight - this._box.verticalSum;
    for (let i = 0, n = this._items.length; i < n; ++i) {
      let item = this._items[i];
      if (item.isHidden) {
        continue;
      }
      item.widget.node.style.zIndex = `${i}`;
      item.update(left, top, width, height);
    }
  }
};
var Private$1;
(function(Private6) {
  function createLayout(options) {
    return options.layout || new StackedLayout();
  }
  Private6.createLayout = createLayout;
})(Private$1 || (Private$1 = {}));
var Private4;
(function(Private6) {
  function orientationFromPlacement(plc) {
    return placementToOrientationMap[plc];
  }
  Private6.orientationFromPlacement = orientationFromPlacement;
  function directionFromPlacement(plc) {
    return placementToDirectionMap[plc];
  }
  Private6.directionFromPlacement = directionFromPlacement;
  const placementToOrientationMap = {
    top: "horizontal",
    left: "vertical",
    right: "vertical",
    bottom: "horizontal"
  };
  const placementToDirectionMap = {
    top: "top-to-bottom",
    left: "left-to-right",
    right: "right-to-left",
    bottom: "bottom-to-top"
  };
})(Private4 || (Private4 = {}));

// node_modules/@jupyter-widgets/base/lib/version.js
var JUPYTER_WIDGETS_VERSION = "2.0.0";
var PROTOCOL_VERSION = "2.1.0";

// node_modules/@jupyter-widgets/base/lib/widget.js
var IPY_MODEL_ = "IPY_MODEL_";
function unpack_models(value, manager) {
  if (Array.isArray(value)) {
    const unpacked = [];
    for (const sub_value of value) {
      unpacked.push(unpack_models(sub_value, manager));
    }
    return Promise.all(unpacked);
  } else if (value instanceof Object && typeof value !== "string") {
    const unpacked = {};
    for (const [key, sub_value] of Object.entries(value)) {
      unpacked[key] = unpack_models(sub_value, manager);
    }
    return resolvePromisesDict(unpacked);
  } else if (typeof value === "string" && value.slice(0, 10) === IPY_MODEL_) {
    return manager.get_model(value.slice(10, value.length));
  } else {
    return Promise.resolve(value);
  }
}
function pack_models(value, widget) {
  if (Array.isArray(value)) {
    const model_ids = [];
    for (const model of value) {
      model_ids.push(pack_models(model, widget));
    }
    return model_ids;
  } else if (value instanceof WidgetModel) {
    return `${IPY_MODEL_}${value.model_id}`;
  } else if (value instanceof Object && typeof value !== "string") {
    const packed = {};
    for (const [key, sub_value] of Object.entries(value)) {
      packed[key] = pack_models(sub_value, widget);
    }
    return packed;
  } else {
    return value;
  }
}
var WidgetModel = class extends Backbone2.Model {
  /**
   * The default attributes.
   */
  defaults() {
    return {
      _model_module: "@jupyter-widgets/base",
      _model_name: "WidgetModel",
      _model_module_version: JUPYTER_WIDGETS_VERSION,
      _view_module: "@jupyter-widgets/base",
      _view_name: null,
      _view_module_version: JUPYTER_WIDGETS_VERSION,
      _view_count: null
    };
  }
  /**
   * Test to see if the model has been synced with the server.
   *
   * #### Notes
   * As of backbone 1.1, backbone ignores `patch` if it thinks the
   * model has never been pushed.
   */
  isNew() {
    return false;
  }
  /**
   * Constructor
   *
   * Initializes a WidgetModel instance. Called by the Backbone constructor.
   *
   * Parameters
   * ----------
   * widget_manager : WidgetManager instance
   * model_id : string
   *      An ID unique to this model.
   * comm : Comm instance (optional)
   */
  initialize(attributes, options) {
    this._expectedEchoMsgIds = /* @__PURE__ */ new Map();
    this._attrsToUpdate = /* @__PURE__ */ new Set();
    super.initialize(attributes, options);
    this.widget_manager = options.widget_manager;
    this.model_id = options.model_id;
    const comm = options.comm;
    this.views = /* @__PURE__ */ Object.create(null);
    this.state_change = Promise.resolve();
    this._closed = false;
    this._state_lock = null;
    this._msg_buffer = null;
    this._msg_buffer_callbacks = null;
    this._pending_msgs = 0;
    this._buffered_state_diff = {};
    if (comm) {
      this.comm = comm;
      comm.on_close(this._handle_comm_closed.bind(this));
      comm.on_msg(this._handle_comm_msg.bind(this));
      this.comm_live = true;
    } else {
      this.comm_live = false;
    }
  }
  get comm_live() {
    return this._comm_live;
  }
  set comm_live(x) {
    this._comm_live = x;
    this.trigger("comm_live_update");
  }
  /**
   * Send a custom msg over the comm.
   */
  send(content, callbacks, buffers) {
    if (this.comm !== void 0) {
      const data = { method: "custom", content };
      this.comm.send(data, callbacks, {}, buffers);
    }
  }
  /**
   * Close model
   *
   * @param comm_closed - true if the comm is already being closed. If false, the comm will be closed.
   *
   * @returns - a promise that is fulfilled when all the associated views have been removed.
   */
  close(comm_closed = false) {
    if (this._closed) {
      return Promise.resolve();
    }
    this._closed = true;
    if (this.comm && !comm_closed) {
      this.comm.close();
    }
    this.stopListening();
    this.trigger("destroy", this);
    if (this.comm) {
      delete this.comm;
    }
    if (this.views) {
      const views = Object.keys(this.views).map((id) => {
        return this.views[id].then((view) => view.remove());
      });
      delete this.views;
      return Promise.all(views).then(() => {
        return;
      });
    }
    return Promise.resolve();
  }
  /**
   * Handle when a widget comm is closed.
   */
  _handle_comm_closed(msg) {
    this.trigger("comm:close");
    this.close(true);
  }
  /**
   * Handle incoming comm msg.
   */
  _handle_comm_msg(msg) {
    const data = msg.content.data;
    const method = data.method;
    switch (method) {
      case "update":
      case "echo_update":
        this.state_change = this.state_change.then(() => {
          var _a, _b, _c;
          const state = data.state;
          const buffer_paths = (_a = data.buffer_paths) !== null && _a !== void 0 ? _a : [];
          const buffers = (_c = (_b = msg.buffers) === null || _b === void 0 ? void 0 : _b.slice(0, buffer_paths.length)) !== null && _c !== void 0 ? _c : [];
          put_buffers(state, buffer_paths, buffers);
          if (msg.parent_header && method === "echo_update") {
            const msgId = msg.parent_header.msg_id;
            const expectedEcho = Object.keys(state).filter((attrName) => this._expectedEchoMsgIds.has(attrName));
            expectedEcho.forEach((attrName) => {
              const isOldMessage = this._expectedEchoMsgIds.get(attrName) !== msgId;
              if (isOldMessage) {
                delete state[attrName];
              } else {
                this._expectedEchoMsgIds.delete(attrName);
                if (this._msg_buffer !== null && Object.prototype.hasOwnProperty.call(this._msg_buffer, attrName)) {
                  delete state[attrName];
                }
              }
            });
          }
          return this.constructor._deserialize_state(
            // Combine the state updates, with preference for kernel updates
            state,
            this.widget_manager
          );
        }).then((state) => {
          this.set_state(state);
        }).catch(reject(`Could not process update msg for model id: ${this.model_id}`, true));
        return this.state_change;
      case "custom":
        this.trigger("msg:custom", data.content, msg.buffers);
        return Promise.resolve();
    }
    return Promise.resolve();
  }
  /**
   * Handle when a widget is updated from the backend.
   *
   * This function is meant for internal use only. Values set here will not be propagated on a sync.
   */
  set_state(state) {
    this._state_lock = state;
    try {
      this.set(state);
    } catch (e) {
      console.error(`Error setting state: ${e instanceof Error ? e.message : e}`);
    } finally {
      this._state_lock = null;
    }
  }
  /**
   * Get the serializable state of the model.
   *
   * If drop_default is truthy, attributes that are equal to their default
   * values are dropped.
   */
  get_state(drop_defaults) {
    const fullState = this.attributes;
    if (drop_defaults) {
      const d = this.defaults;
      const defaults = typeof d === "function" ? d.call(this) : d;
      const state = {};
      Object.keys(fullState).forEach((key) => {
        if (!isEqual(fullState[key], defaults[key])) {
          state[key] = fullState[key];
        }
      });
      return state;
    } else {
      return Object.assign({}, fullState);
    }
  }
  /**
   * Handle status msgs.
   *
   * execution_state : ('busy', 'idle', 'starting')
   */
  _handle_status(msg) {
    if (this.comm !== void 0) {
      if (msg.content.execution_state === "idle") {
        this._pending_msgs--;
        if (this._pending_msgs < 0) {
          console.error(`Jupyter Widgets message throttle: Pending messages < 0 (=${this._pending_msgs}), which is unexpected. Resetting to 0 to continue.`);
          this._pending_msgs = 0;
        }
        if (this._msg_buffer !== null && this._pending_msgs < 1) {
          const msgId = this.send_sync_message(this._msg_buffer, this._msg_buffer_callbacks);
          this.rememberLastUpdateFor(msgId);
          this._msg_buffer = null;
          this._msg_buffer_callbacks = null;
        }
      }
    }
  }
  /**
   * Create msg callbacks for a comm msg.
   */
  callbacks(view) {
    return this.widget_manager.callbacks(view);
  }
  /**
   * Set one or more values.
   *
   * We just call the super method, in which val and options are optional.
   * Handles both "key", value and {key: value} -style arguments.
   */
  set(key, val, options) {
    const return_value = set.call(this, key, val, options);
    if (this._buffered_state_diff !== void 0) {
      const attrs = this.changedAttributes() || {};
      if (this._state_lock) {
        for (const key2 of Object.keys(this._state_lock)) {
          if (attrs[key2] === this._state_lock[key2]) {
            delete attrs[key2];
          }
        }
      }
      if (this._buffered_state_diff_synced) {
        for (const key2 of Object.keys(this._buffered_state_diff_synced)) {
          if (attrs[key2] === this._buffered_state_diff_synced[key2]) {
            delete attrs[key2];
          }
        }
      }
      this._buffered_state_diff = assign(this._buffered_state_diff, attrs);
    }
    if (this._changing === false) {
      this._buffered_state_diff_synced = {};
    }
    return return_value;
  }
  /**
   * Handle sync to the back-end.  Called when a model.save() is called.
   *
   * Make sure a comm exists.
   *
   * Parameters
   * ----------
   * method : create, update, patch, delete, read
   *   create/update always send the full attribute set
   *   patch - only send attributes listed in options.attrs, and if we
   *   are queuing up messages, combine with previous messages that have
   *   not been sent yet
   * model : the model we are syncing
   *   will normally be the same as `this`
   * options : dict
   *   the `attrs` key, if it exists, gives an {attr: value} dict that
   *   should be synced, otherwise, sync all attributes.
   *
   */
  sync(method, model, options = {}) {
    if (this.comm === void 0) {
      throw "Syncing error: no comm channel defined";
    }
    const attrs = method === "patch" ? options.attrs : model.get_state(options.drop_defaults);
    if (this._state_lock) {
      for (const key of Object.keys(this._state_lock)) {
        if (attrs[key] === this._state_lock[key]) {
          delete attrs[key];
        }
      }
    }
    Object.keys(attrs).forEach((attrName) => {
      this._attrsToUpdate.add(attrName);
    });
    const msgState = this.serialize(attrs);
    if (Object.keys(msgState).length > 0) {
      const callbacks = options.callbacks || this.callbacks();
      if (this._pending_msgs >= 1) {
        switch (method) {
          case "patch":
            this._msg_buffer = assign(this._msg_buffer || {}, msgState);
            break;
          case "update":
          case "create":
            this._msg_buffer = msgState;
            break;
          default:
            throw "unrecognized syncing method";
        }
        this._msg_buffer_callbacks = callbacks;
      } else {
        const msgId = this.send_sync_message(attrs, callbacks);
        this.rememberLastUpdateFor(msgId);
      }
    }
  }
  rememberLastUpdateFor(msgId) {
    this._attrsToUpdate.forEach((attrName) => {
      this._expectedEchoMsgIds.set(attrName, msgId);
    });
    this._attrsToUpdate = /* @__PURE__ */ new Set();
  }
  /**
   * Serialize widget state.
   *
   * A serializer is a function which takes in a state attribute and a widget,
   * and synchronously returns a JSONable object. The returned object will
   * have toJSON called if possible, and the final result should be a
   * primitive object that is a snapshot of the widget state that may have
   * binary array buffers.
   */
  serialize(state) {
    const serializers = this.constructor.serializers || import_coreutils5.JSONExt.emptyObject;
    for (const k of Object.keys(state)) {
      try {
        if (serializers[k] && serializers[k].serialize) {
          state[k] = serializers[k].serialize(state[k], this);
        } else {
          state[k] = JSON.parse(JSON.stringify(state[k]));
        }
        if (state[k] && state[k].toJSON) {
          state[k] = state[k].toJSON();
        }
      } catch (e) {
        console.error("Error serializing widget state attribute: ", k);
        throw e;
      }
    }
    return state;
  }
  /**
   * Send a sync message to the kernel.
   *
   * If a message is sent successfully, this returns the message ID of that
   * message. Otherwise it returns an empty string
   */
  send_sync_message(state, callbacks = {}) {
    if (!this.comm) {
      return "";
    }
    try {
      callbacks = {
        shell: Object.assign({}, callbacks.shell),
        iopub: Object.assign({}, callbacks.iopub),
        input: callbacks.input
      };
      const statuscb = callbacks.iopub.status;
      callbacks.iopub.status = (msg) => {
        this._handle_status(msg);
        if (statuscb) {
          statuscb(msg);
        }
      };
      const split = remove_buffers(state);
      const msgId = this.comm.send({
        method: "update",
        state: split.state,
        buffer_paths: split.buffer_paths
      }, callbacks, {}, split.buffers);
      this._pending_msgs++;
      return msgId;
    } catch (e) {
      console.error("Could not send widget sync message", e);
    }
    return "";
  }
  /**
   * Push this model's state to the back-end
   *
   * This invokes a Backbone.Sync.
   */
  save_changes(callbacks) {
    if (this.comm_live) {
      const options = { patch: true };
      if (callbacks) {
        options.callbacks = callbacks;
      }
      this.save(this._buffered_state_diff, options);
      if (this._changing) {
        assign(this._buffered_state_diff_synced, this._buffered_state_diff);
      }
      this._buffered_state_diff = {};
    }
  }
  /**
   * on_some_change(['key1', 'key2'], foo, context) differs from
   * on('change:key1 change:key2', foo, context).
   * If the widget attributes key1 and key2 are both modified,
   * the second form will result in foo being called twice
   * while the first will call foo only once.
   */
  on_some_change(keys, callback, context) {
    this.on("change", (...args) => {
      if (keys.some(this.hasChanged, this)) {
        callback.apply(context, args);
      }
    }, this);
  }
  /**
   * Serialize the model.  See the deserialization function at the top of this file
   * and the kernel-side serializer/deserializer.
   */
  toJSON(options) {
    return `IPY_MODEL_${this.model_id}`;
  }
  /**
   * Returns a promise for the deserialized state. The second argument
   * is an instance of widget manager, which is required for the
   * deserialization of widget models.
   */
  static _deserialize_state(state, manager) {
    const serializers = this.serializers;
    let deserialized;
    if (serializers) {
      deserialized = {};
      for (const k in state) {
        if (serializers[k] && serializers[k].deserialize) {
          deserialized[k] = serializers[k].deserialize(state[k], manager);
        } else {
          deserialized[k] = state[k];
        }
      }
    } else {
      deserialized = state;
    }
    return resolvePromisesDict(deserialized);
  }
};
var DOMWidgetModel = class extends WidgetModel {
  defaults() {
    return assign(super.defaults(), {
      _dom_classes: [],
      tabbable: null,
      tooltip: null
      // We do not declare defaults for the layout and style attributes.
      // Those defaults are constructed on the kernel side and synced here
      // as needed, and our code here copes with those attributes being
      // undefined. See
      // https://github.com/jupyter-widgets/ipywidgets/issues/1620 and
      // https://github.com/jupyter-widgets/ipywidgets/pull/1621
    });
  }
};
DOMWidgetModel.serializers = Object.assign(Object.assign({}, WidgetModel.serializers), { layout: { deserialize: unpack_models }, style: { deserialize: unpack_models } });
var WidgetView = class extends NativeView {
  /**
   * Public constructor.
   */
  constructor(options) {
    super(options);
  }
  /**
   * Initializer, called at the end of the constructor.
   */
  initialize(parameters) {
    this.listenTo(this.model, "change", (model, options) => {
      const changed = Object.keys(this.model.changedAttributes() || {});
      if (changed[0] === "_view_count" && changed.length === 1) {
        return;
      }
      this.update(options);
    });
    this.options = parameters.options;
    this.once("remove", () => {
      if (typeof this.model.get("_view_count") === "number") {
        this.model.set("_view_count", this.model.get("_view_count") - 1);
        this.model.save_changes();
      }
    });
    this.once("displayed", () => {
      if (typeof this.model.get("_view_count") === "number") {
        this.model.set("_view_count", this.model.get("_view_count") + 1);
        this.model.save_changes();
      }
    });
    this.displayed = new Promise((resolve, reject3) => {
      this.once("displayed", resolve);
      this.model.on("msg:custom", this.handle_message.bind(this));
    });
  }
  /**
   * Handle message sent to the front end.
   *
   * Used to focus or blur the widget.
   */
  handle_message(content) {
    if (content.do === "focus") {
      this.el.focus();
    } else if (content.do === "blur") {
      this.el.blur();
    }
  }
  /**
   * Triggered on model change.
   *
   * Update view to be consistent with this.model
   */
  update(options) {
    return;
  }
  /**
   * Render a view
   *
   * @returns the view or a promise to the view.
   */
  render() {
    return;
  }
  create_child_view(child_model, options = {}) {
    options = Object.assign({ parent: this }, options);
    return this.model.widget_manager.create_view(child_model, options).catch(reject("Could not create child view", true));
  }
  /**
   * Create msg callbacks for a comm msg.
   */
  callbacks() {
    return this.model.callbacks(this);
  }
  /**
   * Send a custom msg associated with this view.
   */
  send(content, buffers) {
    this.model.send(content, this.callbacks(), buffers);
  }
  touch() {
    this.model.save_changes(this.callbacks());
  }
  remove() {
    super.remove();
    this.trigger("remove");
    return this;
  }
};
var JupyterLuminoWidget = class extends Widget {
  constructor(options) {
    const view = options.view;
    delete options.view;
    super(options);
    this._view = view;
  }
  /**
   * Dispose the widget.
   *
   * This causes the view to be destroyed as well with 'remove'
   */
  dispose() {
    if (this.isDisposed) {
      return;
    }
    super.dispose();
    this._view.remove();
    this._view = null;
  }
  /**
   * Process the Lumino message.
   *
   * Any custom Lumino widget used inside a Jupyter widget should override
   * the processMessage function like this.
   */
  processMessage(msg) {
    super.processMessage(msg);
    this._view.processLuminoMessage(msg);
  }
};
var JupyterPhosphorWidget = JupyterLuminoWidget;
var JupyterLuminoPanelWidget = class extends Panel {
  constructor(options) {
    const view = options.view;
    delete options.view;
    super(options);
    this._view = view;
  }
  /**
   * Process the Lumino message.
   *
   * Any custom Lumino widget used inside a Jupyter widget should override
   * the processMessage function like this.
   */
  processMessage(msg) {
    super.processMessage(msg);
    this._view.processLuminoMessage(msg);
  }
  /**
   * Dispose the widget.
   *
   * This causes the view to be destroyed as well with 'remove'
   */
  dispose() {
    var _a;
    if (this.isDisposed) {
      return;
    }
    super.dispose();
    (_a = this._view) === null || _a === void 0 ? void 0 : _a.remove();
    this._view = null;
  }
};
var JupyterPhosphorPanelWidget = JupyterLuminoPanelWidget;
var DOMWidgetView = class extends WidgetView {
  /**
   * Public constructor
   */
  initialize(parameters) {
    super.initialize(parameters);
    this.listenTo(this.model, "change:_dom_classes", (model, new_classes) => {
      const old_classes = model.previous("_dom_classes");
      this.update_classes(old_classes, new_classes);
    });
    this.layoutPromise = Promise.resolve();
    this.listenTo(this.model, "change:layout", (model, value) => {
      this.setLayout(value, model.previous("layout"));
    });
    this.stylePromise = Promise.resolve();
    this.listenTo(this.model, "change:style", (model, value) => {
      this.setStyle(value, model.previous("style"));
    });
    this.displayed.then(() => {
      this.update_classes([], this.model.get("_dom_classes"));
      this.setLayout(this.model.get("layout"));
      this.setStyle(this.model.get("style"));
    });
    this._comm_live_update();
    this.listenTo(this.model, "comm_live_update", () => {
      this._comm_live_update();
    });
    this.listenTo(this.model, "change:tooltip", this.updateTooltip);
    this.updateTooltip();
  }
  setLayout(layout, oldLayout) {
    if (layout) {
      this.layoutPromise = this.layoutPromise.then((oldLayoutView) => {
        if (oldLayoutView) {
          oldLayoutView.unlayout();
          this.stopListening(oldLayoutView.model);
          oldLayoutView.remove();
        }
        return this.create_child_view(layout).then((view) => {
          return this.displayed.then(() => {
            view.trigger("displayed");
            this.listenTo(view.model, "change", () => {
              import_messaging2.MessageLoop.postMessage(this.luminoWidget, Widget.ResizeMessage.UnknownSize);
            });
            import_messaging2.MessageLoop.postMessage(this.luminoWidget, Widget.ResizeMessage.UnknownSize);
            this.trigger("layout-changed");
            return view;
          });
        }).catch(reject("Could not add LayoutView to DOMWidgetView", true));
      });
    }
  }
  setStyle(style, oldStyle) {
    if (style) {
      this.stylePromise = this.stylePromise.then((oldStyleView) => {
        if (oldStyleView) {
          oldStyleView.unstyle();
          this.stopListening(oldStyleView.model);
          oldStyleView.remove();
        }
        return this.create_child_view(style).then((view) => {
          return this.displayed.then(() => {
            view.trigger("displayed");
            this.trigger("style-changed");
            return view;
          });
        }).catch(reject("Could not add styleView to DOMWidgetView", true));
      });
    }
  }
  updateTooltip() {
    const title = this.model.get("tooltip");
    if (!title) {
      this.el.removeAttribute("title");
    } else if (this.model.get("description").length === 0) {
      this.el.setAttribute("title", title);
    }
  }
  /**
   * Update the DOM classes applied to an element, default to this.el.
   */
  update_classes(old_classes, new_classes, el) {
    if (el === void 0) {
      el = this.el;
    }
    difference(old_classes, new_classes).map(function(c) {
      if (el.classList) {
        el.classList.remove(c);
      } else {
        el.setAttribute("class", el.getAttribute("class").replace(c, ""));
      }
    });
    difference(new_classes, old_classes).map(function(c) {
      if (el.classList) {
        el.classList.add(c);
      } else {
        el.setAttribute("class", el.getAttribute("class").concat(" ", c));
      }
    });
  }
  /**
   * Update the DOM classes applied to the widget based on a single
   * trait's value.
   *
   * Given a trait value classes map, this function automatically
   * handles applying the appropriate classes to the widget element
   * and removing classes that are no longer valid.
   *
   * Parameters
   * ----------
   * class_map: dictionary
   *  Dictionary of trait values to class lists.
   *  Example:
   *      {
   *          success: ['alert', 'alert-success'],
   *          info: ['alert', 'alert-info'],
   *          warning: ['alert', 'alert-warning'],
   *          danger: ['alert', 'alert-danger']
   *      };
   * trait_name: string
   *  Name of the trait to check the value of.
   * el: optional DOM element handle, defaults to this.el
   *  Element that the classes are applied to.
   */
  update_mapped_classes(class_map, trait_name, el) {
    let key = this.model.previous(trait_name);
    const old_classes = class_map[key] ? class_map[key] : [];
    key = this.model.get(trait_name);
    const new_classes = class_map[key] ? class_map[key] : [];
    this.update_classes(old_classes, new_classes, el || this.el);
  }
  set_mapped_classes(class_map, trait_name, el) {
    const key = this.model.get(trait_name);
    const new_classes = class_map[key] ? class_map[key] : [];
    this.update_classes([], new_classes, el || this.el);
  }
  _setElement(el) {
    if (this.luminoWidget) {
      this.luminoWidget.dispose();
    }
    this.$el = el instanceof import_jquery.default ? el : (0, import_jquery.default)(el);
    this.el = this.$el[0];
    this.luminoWidget = new JupyterLuminoWidget({
      node: el,
      view: this
    });
  }
  remove() {
    if (this.luminoWidget) {
      this.luminoWidget.dispose();
    }
    return super.remove();
  }
  /**
   * @deprecated Use {@link processLuminoMessage} instead (Since 8.0).
   */
  processPhosphorMessage(msg) {
    this.processLuminoMessage(msg);
  }
  processLuminoMessage(msg) {
    switch (msg.type) {
      case "after-attach":
        this.trigger("displayed");
        break;
      case "show":
        this.trigger("shown");
        break;
    }
  }
  _comm_live_update() {
    if (this.model.comm_live) {
      this.luminoWidget.removeClass("jupyter-widgets-disconnected");
    } else {
      this.luminoWidget.addClass("jupyter-widgets-disconnected");
    }
  }
  updateTabindex() {
    const tabbable = this.model.get("tabbable");
    if (tabbable === true) {
      this.el.setAttribute("tabIndex", "0");
    } else if (tabbable === false) {
      this.el.setAttribute("tabIndex", "-1");
    } else if (tabbable === null) {
      this.el.removeAttribute("tabIndex");
    }
  }
  /**
   * @deprecated Use {@link luminoWidget} instead (Since 8.0).
   */
  get pWidget() {
    return this.luminoWidget;
  }
  /**
   * @deprecated Use {@link luminoWidget} instead (Since 8.0).
   */
  set pWidget(value) {
    this.luminoWidget = value;
  }
};

// node_modules/@jupyter-widgets/base/lib/widget_layout.js
var css_properties = {
  align_content: null,
  align_items: null,
  align_self: null,
  border_top: null,
  border_right: null,
  border_bottom: null,
  border_left: null,
  bottom: null,
  display: null,
  flex: null,
  flex_flow: null,
  height: null,
  justify_content: null,
  justify_items: null,
  left: null,
  margin: null,
  max_height: null,
  max_width: null,
  min_height: null,
  min_width: null,
  overflow: null,
  order: null,
  padding: null,
  right: null,
  top: null,
  visibility: null,
  width: null,
  // image-specific
  object_fit: null,
  object_position: null,
  // container
  grid_auto_columns: null,
  grid_auto_flow: null,
  grid_auto_rows: null,
  grid_gap: null,
  grid_template_rows: null,
  grid_template_columns: null,
  grid_template_areas: null,
  // items
  grid_row: null,
  grid_column: null,
  grid_area: null
};
var LayoutModel = class extends WidgetModel {
  defaults() {
    return assign(super.defaults(), {
      _model_name: "LayoutModel",
      _view_name: "LayoutView"
    }, css_properties);
  }
};
var LayoutView = class extends WidgetView {
  /**
   * Public constructor
   */
  initialize(parameters) {
    this._traitNames = [];
    super.initialize(parameters);
    for (const key of Object.keys(css_properties)) {
      this.registerTrait(key);
    }
  }
  /**
   * Register a CSS trait that is known by the model
   * @param trait
   */
  registerTrait(trait) {
    this._traitNames.push(trait);
    this.listenTo(this.model, "change:" + trait, (model, value) => {
      this.handleChange(trait, value);
    });
    this.handleChange(trait, this.model.get(trait));
  }
  /**
   * Get the the name of the css property from the trait name
   * @param  model attribute name
   * @return css property name
   */
  css_name(trait) {
    return trait.replace(/_/g, "-");
  }
  /**
   * Handles when a trait value changes
   */
  handleChange(trait, value) {
    const parent = this.options.parent;
    if (parent) {
      if (value === null) {
        parent.el.style.removeProperty(this.css_name(trait));
      } else {
        parent.el.style.setProperty(this.css_name(trait), value);
      }
    } else {
      console.warn("Style not applied because a parent view does not exist");
    }
  }
  /**
   * Remove the styling from the parent view.
   */
  unlayout() {
    const parent = this.options.parent;
    this._traitNames.forEach((trait) => {
      if (parent) {
        parent.el.style.removeProperty(this.css_name(trait));
      } else {
        console.warn("Style not removed because a parent view does not exist");
      }
    }, this);
  }
};

// node_modules/@jupyter-widgets/base/lib/widget_style.js
var StyleModel = class extends WidgetModel {
  defaults() {
    const Derived = this.constructor;
    return assign(super.defaults(), {
      _model_name: "StyleModel",
      _view_name: "StyleView"
    }, Object.keys(Derived.styleProperties).reduce((obj, key) => {
      obj[key] = Derived.styleProperties[key].default;
      return obj;
    }, {}));
  }
};
StyleModel.styleProperties = {};
var StyleView = class extends WidgetView {
  /**
   * Public constructor
   */
  initialize(parameters) {
    this._traitNames = [];
    super.initialize(parameters);
    const ModelType = this.model.constructor;
    for (const key of Object.keys(ModelType.styleProperties)) {
      this.registerTrait(key);
    }
    this.style();
  }
  /**
   * Register a CSS trait that is known by the model
   * @param trait
   */
  registerTrait(trait) {
    this._traitNames.push(trait);
    this.listenTo(this.model, "change:" + trait, (model, value) => {
      this.handleChange(trait, value);
    });
  }
  /**
   * Handles when a trait value changes
   */
  handleChange(trait, value) {
    const parent = this.options.parent;
    if (parent) {
      const ModelType = this.model.constructor;
      const styleProperties = ModelType.styleProperties;
      const attribute = styleProperties[trait].attribute;
      const selector = styleProperties[trait].selector;
      const elements = selector ? parent.el.querySelectorAll(selector) : [parent.el];
      if (value === null) {
        for (let i = 0; i !== elements.length; ++i) {
          elements[i].style.removeProperty(attribute);
        }
      } else {
        for (let i = 0; i !== elements.length; ++i) {
          elements[i].style.setProperty(attribute, value);
        }
      }
    } else {
      console.warn("Style not applied because a parent view does not exist");
    }
  }
  /**
   * Apply styles for all registered traits
   */
  style() {
    for (const trait of this._traitNames) {
      this.handleChange(trait, this.model.get(trait));
    }
  }
  /**
   * Remove the styling from the parent view.
   */
  unstyle() {
    const parent = this.options.parent;
    const ModelType = this.model.constructor;
    const styleProperties = ModelType.styleProperties;
    this._traitNames.forEach((trait) => {
      if (parent) {
        const attribute = styleProperties[trait].attribute;
        const selector = styleProperties[trait].selector;
        const elements = selector ? parent.el.querySelectorAll(selector) : [parent.el];
        for (let i = 0; i !== elements.length; ++i) {
          elements[i].style.removeProperty(attribute);
        }
      } else {
        console.warn("Style not removed because a parent view does not exist");
      }
    }, this);
  }
};

// node_modules/@jupyter-widgets/base/lib/services-shim.js
var shims;
(function(shims2) {
  let services;
  (function(services2) {
    class CommManager {
      constructor(jsServicesKernel) {
        this.targets = /* @__PURE__ */ Object.create(null);
        this.comms = /* @__PURE__ */ Object.create(null);
        this.init_kernel(jsServicesKernel);
      }
      /**
       * Hookup kernel events.
       * @param  {Kernel.IKernel} jsServicesKernel - @jupyterlab/services Kernel.IKernel instance
       */
      init_kernel(jsServicesKernel) {
        this.kernel = jsServicesKernel;
        this.jsServicesKernel = jsServicesKernel;
      }
      /**
       * Creates a new connected comm
       */
      async new_comm(target_name, data, callbacks, metadata, comm_id, buffers) {
        const c = this.jsServicesKernel.createComm(target_name, comm_id);
        const comm = new Comm(c);
        this.register_comm(comm);
        comm.open(data, callbacks, metadata, buffers);
        return comm;
      }
      /**
       * Register a comm target
       * @param  {string} target_name
       * @param  {(Comm, object) => void} f - callback that is called when the
       *                         comm is made.  Signature of f(comm, msg).
       */
      register_target(target_name, f) {
        const handle = this.jsServicesKernel.registerCommTarget(target_name, (jsServicesComm, msg) => {
          const comm = new Comm(jsServicesComm);
          this.register_comm(comm);
          try {
            return f(comm, msg);
          } catch (e) {
            comm.close();
            console.error(e);
            console.error(new Error("Exception opening new comm"));
          }
        });
        this.targets[target_name] = handle;
      }
      /**
       * Unregisters a comm target
       * @param  {string} target_name
       */
      unregister_target(target_name, f) {
        const handle = this.targets[target_name];
        handle.dispose();
        delete this.targets[target_name];
      }
      /**
       * Register a comm in the mapping
       */
      register_comm(comm) {
        this.comms[comm.comm_id] = Promise.resolve(comm);
        comm.kernel = this.kernel;
        return comm.comm_id;
      }
    }
    services2.CommManager = CommManager;
    class Comm {
      constructor(jsServicesComm) {
        this.jsServicesComm = jsServicesComm;
      }
      /**
       * Comm id
       * @return {string}
       */
      get comm_id() {
        return this.jsServicesComm.commId;
      }
      /**
       * Target name
       * @return {string}
       */
      get target_name() {
        return this.jsServicesComm.targetName;
      }
      /**
       * Opens a sibling comm in the backend
       * @param  data
       * @param  callbacks
       * @param  metadata
       * @return msg id
       */
      open(data, callbacks, metadata, buffers) {
        const future = this.jsServicesComm.open(data, metadata, buffers);
        this._hookupCallbacks(future, callbacks);
        return future.msg.header.msg_id;
      }
      /**
       * Sends a message to the sibling comm in the backend
       * @param  data
       * @param  callbacks
       * @param  metadata
       * @param  buffers
       * @return message id
       */
      send(data, callbacks, metadata, buffers) {
        const future = this.jsServicesComm.send(data, metadata, buffers);
        this._hookupCallbacks(future, callbacks);
        return future.msg.header.msg_id;
      }
      /**
       * Closes the sibling comm in the backend
       * @param  data
       * @param  callbacks
       * @param  metadata
       * @return msg id
       */
      close(data, callbacks, metadata, buffers) {
        const future = this.jsServicesComm.close(data, metadata, buffers);
        this._hookupCallbacks(future, callbacks);
        return future.msg.header.msg_id;
      }
      /**
       * Register a message handler
       * @param  callback, which is given a message
       */
      on_msg(callback) {
        this.jsServicesComm.onMsg = callback.bind(this);
      }
      /**
       * Register a handler for when the comm is closed by the backend
       * @param  callback, which is given a message
       */
      on_close(callback) {
        this.jsServicesComm.onClose = callback.bind(this);
      }
      /**
       * Hooks callback object up with @jupyterlab/services IKernelFuture
       * @param  @jupyterlab/services IKernelFuture instance
       * @param  callbacks
       */
      _hookupCallbacks(future, callbacks) {
        if (callbacks) {
          future.onReply = function(msg) {
            if (callbacks.shell && callbacks.shell.reply) {
              callbacks.shell.reply(msg);
            }
          };
          future.onStdin = function(msg) {
            if (callbacks.input) {
              callbacks.input(msg);
            }
          };
          future.onIOPub = function(msg) {
            if (callbacks.iopub) {
              if (callbacks.iopub.status && msg.header.msg_type === "status") {
                callbacks.iopub.status(msg);
              } else if (callbacks.iopub.clear_output && msg.header.msg_type === "clear_output") {
                callbacks.iopub.clear_output(msg);
              } else if (callbacks.iopub.output) {
                switch (msg.header.msg_type) {
                  case "display_data":
                  case "execute_result":
                  case "stream":
                  case "error":
                    callbacks.iopub.output(msg);
                    break;
                  default:
                    break;
                }
              }
            }
          };
        }
      }
    }
    services2.Comm = Comm;
  })(services = shims2.services || (shims2.services = {}));
})(shims || (shims = {}));

// node_modules/@jupyter-widgets/base/lib/viewlist.js
var ViewList = class {
  constructor(create_view, remove_view, context) {
    this.initialize(create_view, remove_view, context);
  }
  initialize(create_view, remove_view, context) {
    this._handler_context = context || this;
    this._models = [];
    this.views = [];
    this._create_view = create_view;
    this._remove_view = remove_view || function(view) {
      view.remove();
    };
  }
  /**
   * the create_view, remove_view, and context arguments override the defaults
   * specified when the list is created.
   * after this function, the .views attribute is a list of promises for views
   * if you want to perform some action on the list of views, do something like
   * `Promise.all(myviewlist.views).then(function(views) {...});`
   */
  update(new_models, create_view, remove_view, context) {
    const remove = remove_view || this._remove_view;
    const create = create_view || this._create_view;
    context = context || this._handler_context;
    let i = 0;
    for (; i < new_models.length; i++) {
      if (i >= this._models.length || new_models[i] !== this._models[i]) {
        break;
      }
    }
    const first_removed = i;
    const removed = this.views.splice(first_removed, this.views.length - first_removed);
    for (let j = 0; j < removed.length; j++) {
      removed[j].then(function(view) {
        remove.call(context, view);
      });
    }
    for (; i < new_models.length; i++) {
      this.views.push(Promise.resolve(create.call(context, new_models[i], i)));
    }
    this._models = new_models.slice();
    return Promise.all(this.views);
  }
  /**
   * removes every view in the list; convenience function for `.update([])`
   * that should be faster
   * returns a promise that resolves after this removal is done
   */
  remove() {
    return Promise.all(this.views).then((views) => {
      views.forEach((value) => this._remove_view.call(this._handler_context, value));
      this.views = [];
      this._models = [];
    });
  }
  /**
   * Dispose this viewlist.
   *
   * A synchronous function which just deletes references to child views. This
   * function does not call .remove() on child views because that is
   * asynchronous. Use this in cases where child views will be removed in
   * another way.
   */
  dispose() {
    this.views = null;
    this._models = null;
  }
};

// node_modules/@jupyter-widgets/base/lib/registry.js
var import_coreutils6 = require("@lumino/coreutils");
var IJupyterWidgetRegistry = new import_coreutils6.Token("jupyter.extensions.jupyterWidgetRegistry");

// node_modules/@jupyter-widgets/base/lib/errorwidget.js
function createErrorWidgetModel(error, msg) {
  class ErrorWidget extends DOMWidgetModel {
    constructor(attributes, options) {
      attributes = Object.assign(Object.assign({}, attributes), { _view_name: "ErrorWidgetView", _view_module: "@jupyter-widgets/base", _model_module_version: JUPYTER_WIDGETS_VERSION, _view_module_version: JUPYTER_WIDGETS_VERSION, msg, error });
      super(attributes, options);
      this.comm_live = true;
    }
  }
  return ErrorWidget;
}
var ErrorWidgetView = class extends DOMWidgetView {
  generateErrorMessage() {
    return {
      msg: this.model.get("msg"),
      stack: String(this.model.get("error").stack)
    };
  }
  render() {
    const { msg, stack } = this.generateErrorMessage();
    this.el.classList.add("jupyter-widgets");
    const content = document.createElement("div");
    content.classList.add("jupyter-widgets-error-widget", "icon-error");
    content.innerHTML = BROKEN_FILE_SVG_ICON;
    const text = document.createElement("pre");
    text.style.textAlign = "center";
    text.innerText = "Click to show javascript error.";
    content.append(text);
    this.el.appendChild(content);
    let width;
    let height;
    this.el.onclick = () => {
      if (content.classList.contains("icon-error")) {
        height = height || content.clientHeight;
        width = width || content.clientWidth;
        content.classList.remove("icon-error");
        content.innerHTML = `
        <pre>[Open Browser Console for more detailed log - Double click to close this message]
${msg}
${stack}</pre>
        `;
        content.style.height = `${height}px`;
        content.style.width = `${width}px`;
        content.classList.add("text-error");
      }
    };
    this.el.ondblclick = () => {
      if (content.classList.contains("text-error")) {
        content.classList.remove("text-error");
        content.innerHTML = BROKEN_FILE_SVG_ICON;
        content.append(text);
        content.classList.add("icon-error");
      }
    };
  }
};
function createErrorWidgetView(error, msg) {
  return class InnerErrorWidgetView extends ErrorWidgetView {
    generateErrorMessage() {
      return {
        msg,
        stack: String(error instanceof Error ? error.stack : error)
      };
    }
  };
}

// node_modules/@jupyter-widgets/base-manager/lib/index.js
var lib_exports2 = {};
__export(lib_exports2, {
  CONTROL_COMM_PROTOCOL_VERSION: () => CONTROL_COMM_PROTOCOL_VERSION,
  CONTROL_COMM_TARGET: () => CONTROL_COMM_TARGET,
  CONTROL_COMM_TIMEOUT: () => CONTROL_COMM_TIMEOUT,
  ManagerBase: () => ManagerBase,
  base64ToBuffer: () => base64ToBuffer,
  bufferToBase64: () => bufferToBase64,
  bufferToHex: () => bufferToHex,
  hexToBuffer: () => hexToBuffer,
  serialize_state: () => serialize_state
});

// node_modules/@jupyter-widgets/base-manager/lib/manager-base.js
var import_coreutils7 = require("@lumino/coreutils");

// node_modules/@jupyter-widgets/base-manager/lib/utils.js
var import_base64_js = require("base64-js");
var hexTable = [
  "00",
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "0A",
  "0B",
  "0C",
  "0D",
  "0E",
  "0F",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "1A",
  "1B",
  "1C",
  "1D",
  "1E",
  "1F",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "2A",
  "2B",
  "2C",
  "2D",
  "2E",
  "2F",
  "30",
  "31",
  "32",
  "33",
  "34",
  "35",
  "36",
  "37",
  "38",
  "39",
  "3A",
  "3B",
  "3C",
  "3D",
  "3E",
  "3F",
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "4A",
  "4B",
  "4C",
  "4D",
  "4E",
  "4F",
  "50",
  "51",
  "52",
  "53",
  "54",
  "55",
  "56",
  "57",
  "58",
  "59",
  "5A",
  "5B",
  "5C",
  "5D",
  "5E",
  "5F",
  "60",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68",
  "69",
  "6A",
  "6B",
  "6C",
  "6D",
  "6E",
  "6F",
  "70",
  "71",
  "72",
  "73",
  "74",
  "75",
  "76",
  "77",
  "78",
  "79",
  "7A",
  "7B",
  "7C",
  "7D",
  "7E",
  "7F",
  "80",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "8A",
  "8B",
  "8C",
  "8D",
  "8E",
  "8F",
  "90",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99",
  "9A",
  "9B",
  "9C",
  "9D",
  "9E",
  "9F",
  "A0",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "A7",
  "A8",
  "A9",
  "AA",
  "AB",
  "AC",
  "AD",
  "AE",
  "AF",
  "B0",
  "B1",
  "B2",
  "B3",
  "B4",
  "B5",
  "B6",
  "B7",
  "B8",
  "B9",
  "BA",
  "BB",
  "BC",
  "BD",
  "BE",
  "BF",
  "C0",
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "C7",
  "C8",
  "C9",
  "CA",
  "CB",
  "CC",
  "CD",
  "CE",
  "CF",
  "D0",
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
  "D6",
  "D7",
  "D8",
  "D9",
  "DA",
  "DB",
  "DC",
  "DD",
  "DE",
  "DF",
  "E0",
  "E1",
  "E2",
  "E3",
  "E4",
  "E5",
  "E6",
  "E7",
  "E8",
  "E9",
  "EA",
  "EB",
  "EC",
  "ED",
  "EE",
  "EF",
  "F0",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "FA",
  "FB",
  "FC",
  "FD",
  "FE",
  "FF"
];
function bufferToHex(buffer) {
  const x = new Uint8Array(buffer);
  const s = [];
  for (let i = 0; i < x.length; i++) {
    s.push(hexTable[x[i]]);
  }
  return s.join("");
}
function hexToBuffer(hex) {
  const x = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    x[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return x.buffer;
}
function bufferToBase64(buffer) {
  return (0, import_base64_js.fromByteArray)(new Uint8Array(buffer));
}
function base64ToBuffer(base64) {
  return (0, import_base64_js.toByteArray)(base64).buffer;
}

// node_modules/@jupyter-widgets/base-manager/lib/latex.js
var inline = "$";
var MATHSPLIT = /(\$\$?|\\(?:begin|end)\{[a-z]*\*?\}|\\[{}$]|[{}]|(?:\n\s*)+|@@\d+@@|\\\\(?:\(|\)|\[|\]))/i;
function removeMath(text) {
  const math = [];
  let start = null;
  let end = null;
  let last = null;
  let braces = 0;
  let deTilde;
  const hasCodeSpans = /`/.test(text);
  if (hasCodeSpans) {
    text = text.replace(/~/g, "~T").replace(/(^|[^\\])(`+)([^\n]*?[^`\n])\2(?!`)/gm, (wholematch) => wholematch.replace(/\$/g, "~D"));
    deTilde = (text2) => {
      return text2.replace(/~([TD])/g, (wholematch, character) => character === "T" ? "~" : inline);
    };
  } else {
    deTilde = (text2) => {
      return text2;
    };
  }
  let blocks = text.replace(/\r\n?/g, "\n").split(MATHSPLIT);
  for (let i = 1, m = blocks.length; i < m; i += 2) {
    const block = blocks[i];
    if (block.charAt(0) === "@") {
      blocks[i] = "@@" + math.length + "@@";
      math.push(block);
    } else if (start !== null) {
      if (block === end) {
        if (braces) {
          last = i;
        } else {
          blocks = processMath(start, i, deTilde, math, blocks);
          start = null;
          end = null;
          last = null;
        }
      } else if (block.match(/\n.*\n/)) {
        if (last !== null) {
          i = last;
          blocks = processMath(start, i, deTilde, math, blocks);
        }
        start = null;
        end = null;
        last = null;
        braces = 0;
      } else if (block === "{") {
        braces++;
      } else if (block === "}" && braces) {
        braces--;
      }
    } else {
      if (block === inline || block === "$$") {
        start = i;
        end = block;
        braces = 0;
      } else if (block === "\\\\(" || block === "\\\\[") {
        start = i;
        end = block.slice(-1) === "(" ? "\\\\)" : "\\\\]";
        braces = 0;
      } else if (block.substr(1, 5) === "begin") {
        start = i;
        end = "\\end" + block.substr(6);
        braces = 0;
      }
    }
  }
  if (start !== null && last !== null) {
    blocks = processMath(start, last, deTilde, math, blocks);
    start = null;
    end = null;
    last = null;
  }
  return { text: deTilde(blocks.join("")), math };
}
function replaceMath(text, math) {
  const process = (match, n) => {
    let group = math[n];
    if (group.substr(0, 3) === "\\\\(" && group.substr(group.length - 3) === "\\\\)") {
      group = "\\(" + group.substring(3, group.length - 3) + "\\)";
    } else if (group.substr(0, 3) === "\\\\[" && group.substr(group.length - 3) === "\\\\]") {
      group = "\\[" + group.substring(3, group.length - 3) + "\\]";
    }
    return group;
  };
  return text.replace(/@@(\d+)@@/g, process);
}
function processMath(i, j, preProcess, math, blocks) {
  let block = blocks.slice(i, j + 1).join("").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (navigator && navigator.appName === "Microsoft Internet Explorer") {
    block = block.replace(/(%[^\n]*)\n/g, "$1<br/>\n");
  }
  while (j > i) {
    blocks[j] = "";
    j--;
  }
  blocks[i] = "@@" + math.length + "@@";
  if (preProcess) {
    block = preProcess(block);
  }
  math.push(block);
  return blocks;
}

// node_modules/@jupyter-widgets/base-manager/lib/manager-base.js
var import_sanitize_html = __toESM(require("sanitize-html"));
var PROTOCOL_MAJOR_VERSION = PROTOCOL_VERSION.split(".", 1)[0];
var CONTROL_COMM_TARGET = "jupyter.widget.control";
var CONTROL_COMM_PROTOCOL_VERSION = "1.0.0";
var CONTROL_COMM_TIMEOUT = 4e3;
function default_inline_sanitize(s) {
  const allowedTags = [
    "a",
    "abbr",
    "b",
    "code",
    "em",
    "i",
    "img",
    "li",
    "ol",
    "span",
    "strong",
    "ul"
  ];
  const allowedAttributes = {
    "*": ["aria-*", "class", "style", "title"],
    a: ["href"],
    img: ["src"],
    style: ["media", "type"]
  };
  return (0, import_sanitize_html.default)(s, {
    allowedTags,
    allowedAttributes
  });
}
var ManagerBase = class {
  constructor() {
    this.comm_target_name = "jupyter.widget";
    this._models = /* @__PURE__ */ Object.create(null);
  }
  /**
   * Modifies view options. Generally overloaded in custom widget manager
   * implementations.
   */
  setViewOptions(options = {}) {
    return options;
  }
  create_view(model, options = {}) {
    const id = uuid();
    const viewPromise = model.state_change = model.state_change.then(async () => {
      const _view_name = model.get("_view_name");
      const _view_module = model.get("_view_module");
      try {
        const ViewType = await this.loadViewClass(_view_name, _view_module, model.get("_view_module_version"));
        const view = new ViewType({
          model,
          options: this.setViewOptions(options)
        });
        view.listenTo(model, "destroy", view.remove);
        await view.render();
        view.once("remove", () => {
          if (model.views) {
            delete model.views[id];
          }
        });
        return view;
      } catch (e) {
        console.error(`Could not create a view for model id ${model.model_id}`);
        const msg = `Failed to create view for '${_view_name}' from module '${_view_module}' with model '${model.name}' from module '${model.module}'`;
        const ModelCls = createErrorWidgetModel(e, msg);
        const errorModel = new ModelCls();
        const view = new ErrorWidgetView({
          model: errorModel,
          options: this.setViewOptions(options)
        });
        await view.render();
        return view;
      }
    });
    if (model.views) {
      model.views[id] = viewPromise;
    }
    return viewPromise;
  }
  /**
   * callback handlers specific to a view
   */
  callbacks(view) {
    return {};
  }
  /**
   * Get a promise for a model by model id.
   *
   * #### Notes
   * If the model is not found, the returned Promise object is rejected.
   *
   * If you would like to synchronously test if a model exists, use .has_model().
   */
  async get_model(model_id) {
    const modelPromise = this._models[model_id];
    if (modelPromise === void 0) {
      throw new Error("widget model not found");
    }
    return modelPromise;
  }
  /**
   * Returns true if the given model is registered, otherwise false.
   *
   * #### Notes
   * This is a synchronous way to check if a model is registered.
   */
  has_model(model_id) {
    return this._models[model_id] !== void 0;
  }
  /**
   * Handle when a comm is opened.
   */
  handle_comm_open(comm, msg) {
    const protocolVersion = (msg.metadata || {})["version"] || "";
    if (protocolVersion.split(".", 1)[0] !== PROTOCOL_MAJOR_VERSION) {
      const error = `Wrong widget protocol version: received protocol version '${protocolVersion}', but was expecting major version '${PROTOCOL_MAJOR_VERSION}'`;
      console.error(error);
      return Promise.reject(error);
    }
    const data = msg.content.data;
    const buffer_paths = data.buffer_paths || [];
    const buffers = msg.buffers || [];
    put_buffers(data.state, buffer_paths, buffers);
    return this.new_model({
      model_name: data.state["_model_name"],
      model_module: data.state["_model_module"],
      model_module_version: data.state["_model_module_version"],
      comm
    }, data.state).catch(reject("Could not create a model.", true));
  }
  /**
   * Create a comm and new widget model.
   * @param  options - same options as new_model but comm is not
   *                          required and additional options are available.
   * @param  serialized_state - serialized model attributes.
   */
  new_widget(options, serialized_state = {}) {
    let commPromise;
    if (options.view_name === void 0 || options.view_module === void 0 || options.view_module_version === void 0) {
      return Promise.reject("new_widget(...) must be given view information in the options.");
    }
    if (options.comm) {
      commPromise = Promise.resolve(options.comm);
    } else {
      commPromise = this._create_comm(this.comm_target_name, options.model_id, {
        state: {
          _model_module: options.model_module,
          _model_module_version: options.model_module_version,
          _model_name: options.model_name,
          _view_module: options.view_module,
          _view_module_version: options.view_module_version,
          _view_name: options.view_name
        }
      }, { version: PROTOCOL_VERSION });
    }
    const options_clone = Object.assign({}, options);
    return commPromise.then((comm) => {
      options_clone.comm = comm;
      const widget_model = this.new_model(options_clone, serialized_state);
      return widget_model.then((model) => {
        model.sync("create", model);
        return model;
      });
    }, () => {
      if (!options_clone.model_id) {
        options_clone.model_id = uuid();
      }
      return this.new_model(options_clone, serialized_state);
    });
  }
  register_model(model_id, modelPromise) {
    this._models[model_id] = modelPromise;
    modelPromise.then((model) => {
      model.once("comm:close", () => {
        delete this._models[model_id];
      });
    });
  }
  /**
   * Create and return a promise for a new widget model
   *
   * @param options - the options for creating the model.
   * @param serialized_state - attribute values for the model.
   *
   * @example
   * widget_manager.new_model({
   *      model_name: 'IntSlider',
   *      model_module: '@jupyter-widgets/controls',
   *      model_module_version: '1.0.0',
   *      model_id: 'u-u-i-d'
   * }).then((model) => { console.log('Create success!', model); },
   *  (err) => {console.error(err)});
   *
   */
  async new_model(options, serialized_state = {}) {
    var _a, _b;
    const model_id = (_a = options.model_id) !== null && _a !== void 0 ? _a : (_b = options.comm) === null || _b === void 0 ? void 0 : _b.comm_id;
    if (!model_id) {
      throw new Error("Neither comm nor model_id provided in options object. At least one must exist.");
    }
    options.model_id = model_id;
    const modelPromise = this._make_model(options, serialized_state);
    this.register_model(model_id, modelPromise);
    return await modelPromise;
  }
  /**
   * Fetch all widgets states from the kernel using the control comm channel
   * If this fails (control comm handler not implemented kernel side),
   * it will fall back to `_loadFromKernelModels`.
   *
   * This is a utility function that can be used in subclasses.
   */
  async _loadFromKernel() {
    let data;
    let buffers;
    try {
      const initComm = await this._create_comm(CONTROL_COMM_TARGET, uuid(), {}, { version: CONTROL_COMM_PROTOCOL_VERSION });
      await new Promise((resolve, reject3) => {
        initComm.on_msg((msg) => {
          data = msg["content"]["data"];
          if (data.method !== "update_states") {
            console.warn(`
              Unknown ${data.method} message on the Control channel
            `);
            return;
          }
          buffers = (msg.buffers || []).map((b) => {
            if (b instanceof DataView) {
              return b;
            } else {
              return new DataView(b instanceof ArrayBuffer ? b : b.buffer);
            }
          });
          resolve(null);
        });
        initComm.on_close(() => reject3("Control comm was closed too early"));
        initComm.send({ method: "request_states" }, {});
        setTimeout(() => reject3("Control comm did not respond in time"), CONTROL_COMM_TIMEOUT);
      });
      initComm.close();
    } catch (error) {
      return this._loadFromKernelModels();
    }
    const states = data.states;
    const bufferPaths = {};
    const bufferGroups = {};
    for (let i = 0; i < data.buffer_paths.length; i++) {
      const [widget_id, ...path] = data.buffer_paths[i];
      const b = buffers[i];
      if (!bufferPaths[widget_id]) {
        bufferPaths[widget_id] = [];
        bufferGroups[widget_id] = [];
      }
      bufferPaths[widget_id].push(path);
      bufferGroups[widget_id].push(b);
    }
    const widget_comms = await Promise.all(Object.keys(states).map(async (widget_id) => {
      const comm = this.has_model(widget_id) ? void 0 : await this._create_comm("jupyter.widget", widget_id);
      return { widget_id, comm };
    }));
    await Promise.all(widget_comms.map(async ({ widget_id, comm }) => {
      const state = states[widget_id];
      if (widget_id in bufferPaths) {
        put_buffers(state, bufferPaths[widget_id], bufferGroups[widget_id]);
      }
      try {
        if (comm) {
          await this.new_model({
            model_name: state.model_name,
            model_module: state.model_module,
            model_module_version: state.model_module_version,
            model_id: widget_id,
            comm
          }, state.state);
        } else {
          const model = await this.get_model(widget_id);
          const deserializedState = await model.constructor._deserialize_state(state.state, this);
          model.set_state(deserializedState);
        }
      } catch (error) {
        console.error(error);
      }
    }));
  }
  /**
   * Old implementation of fetching widget models one by one using
   * the request_state message on each comm.
   *
   * This is a utility function that can be used in subclasses.
   */
  async _loadFromKernelModels() {
    const comm_ids = await this._get_comm_info();
    const widgets_info = await Promise.all(Object.keys(comm_ids).map(async (comm_id) => {
      if (this.has_model(comm_id)) {
        return;
      }
      const comm = await this._create_comm(this.comm_target_name, comm_id);
      let msg_id = "";
      const info = new import_coreutils7.PromiseDelegate();
      comm.on_msg((msg) => {
        if (msg.parent_header.msg_id === msg_id && msg.header.msg_type === "comm_msg" && msg.content.data.method === "update") {
          const data = msg.content.data;
          const buffer_paths = data.buffer_paths || [];
          const buffers = msg.buffers || [];
          put_buffers(data.state, buffer_paths, buffers);
          info.resolve({ comm, msg });
        }
      });
      msg_id = comm.send({
        method: "request_state"
      }, this.callbacks(void 0));
      return info.promise;
    }));
    await Promise.all(widgets_info.map(async (widget_info) => {
      if (!widget_info) {
        return;
      }
      const content = widget_info.msg.content;
      await this.new_model({
        model_name: content.data.state._model_name,
        model_module: content.data.state._model_module,
        model_module_version: content.data.state._model_module_version,
        comm: widget_info.comm
      }, content.data.state);
    }));
  }
  async _make_model(options, serialized_state = {}) {
    const model_id = options.model_id;
    const model_promise = this.loadModelClass(options.model_name, options.model_module, options.model_module_version);
    let ModelType;
    const makeErrorModel = (error, msg) => {
      const Cls = createErrorWidgetModel(error, msg);
      const widget_model2 = new Cls();
      return widget_model2;
    };
    try {
      ModelType = await model_promise;
    } catch (error) {
      const msg = "Could not instantiate widget";
      console.error(msg);
      return makeErrorModel(error, msg);
    }
    if (!ModelType) {
      const msg = "Could not instantiate widget";
      console.error(msg);
      const error = new Error(`Cannot find model module ${options.model_module}@${options.model_module_version}, ${options.model_name}`);
      return makeErrorModel(error, msg);
    }
    let widget_model;
    try {
      const attributes = await ModelType._deserialize_state(serialized_state, this);
      const modelOptions = {
        widget_manager: this,
        model_id,
        comm: options.comm
      };
      widget_model = new ModelType(attributes, modelOptions);
    } catch (error) {
      console.error(error);
      const msg = `Model class '${options.model_name}' from module '${options.model_module}' is loaded but can not be instantiated`;
      widget_model = makeErrorModel(error, msg);
    }
    widget_model.name = options.model_name;
    widget_model.module = options.model_module;
    return widget_model;
  }
  /**
   * Close all widgets and empty the widget state.
   * @return Promise that resolves when the widget state is cleared.
   */
  clear_state() {
    return resolvePromisesDict(this._models).then((models) => {
      Object.keys(models).forEach((id) => models[id].close());
      this._models = /* @__PURE__ */ Object.create(null);
    });
  }
  /**
   * Asynchronously get the state of the widget manager.
   *
   * This includes all of the widget models, and follows the format given in
   * the @jupyter-widgets/schema package.
   *
   * @param options - The options for what state to return.
   * @returns Promise for a state dictionary
   */
  get_state(options = {}) {
    const modelPromises = Object.keys(this._models).map((id) => this._models[id]);
    return Promise.all(modelPromises).then((models) => {
      return serialize_state(models, options);
    });
  }
  /**
   * Set the widget manager state.
   *
   * @param state - a Javascript object conforming to the application/vnd.jupyter.widget-state+json spec.
   *
   * Reconstructs all of the widget models in the state, merges that with the
   * current manager state, and then attempts to redisplay the widgets in the
   * state.
   */
  set_state(state) {
    if (!(state.version_major && state.version_major <= 2)) {
      throw "Unsupported widget state format";
    }
    const models = state.state;
    const all_models = this._get_comm_info().then((live_comms) => {
      return Promise.all(Object.keys(models).map((model_id) => {
        const decode = {
          base64: base64ToBuffer,
          hex: hexToBuffer
        };
        const model = models[model_id];
        const modelState = model.state;
        if (model.buffers) {
          const bufferPaths = model.buffers.map((b) => b.path);
          const buffers = model.buffers.map((b) => new DataView(decode[b.encoding](b.data)));
          put_buffers(model.state, bufferPaths, buffers);
        }
        if (this.has_model(model_id)) {
          return this.get_model(model_id).then((model2) => {
            return model2.constructor._deserialize_state(modelState || {}, this).then((attributes) => {
              model2.set_state(attributes);
              return model2;
            });
          });
        }
        const modelCreate = {
          model_id,
          model_name: model.model_name,
          model_module: model.model_module,
          model_module_version: model.model_module_version
        };
        if (Object.prototype.hasOwnProperty.call(live_comms, "model_id")) {
          return this._create_comm(this.comm_target_name, model_id).then((comm) => {
            modelCreate.comm = comm;
            return this.new_model(modelCreate);
          });
        } else {
          return this.new_model(modelCreate, modelState);
        }
      }));
    });
    return all_models;
  }
  /**
   * Disconnect the widget manager from the kernel, setting each model's comm
   * as dead.
   */
  disconnect() {
    Object.keys(this._models).forEach((i) => {
      this._models[i].then((model) => {
        model.comm_live = false;
      });
    });
  }
  /**
   * Resolve a URL relative to the current notebook location.
   *
   * The default implementation just returns the original url.
   */
  resolveUrl(url) {
    return Promise.resolve(url);
  }
  inline_sanitize(source) {
    const parts = removeMath(source);
    const sanitized = default_inline_sanitize(parts["text"]);
    return replaceMath(sanitized, parts["math"]);
  }
  async loadModelClass(className, moduleName, moduleVersion) {
    try {
      const promise = this.loadClass(className, moduleName, moduleVersion);
      await promise;
      return promise;
    } catch (error) {
      console.error(error);
      const msg = `Failed to load model class '${className}' from module '${moduleName}'`;
      return createErrorWidgetModel(error, msg);
    }
  }
  async loadViewClass(className, moduleName, moduleVersion) {
    try {
      const promise = this.loadClass(className, moduleName, moduleVersion);
      await promise;
      return promise;
    } catch (error) {
      console.error(error);
      const msg = `Failed to load view class '${className}' from module '${moduleName}'`;
      return createErrorWidgetView(error, msg);
    }
  }
  /**
   * Filter serialized widget state to remove any ID's already present in manager.
   *
   * @param {*} state Serialized state to filter
   *
   * @returns {*} A copy of the state, with its 'state' attribute filtered
   */
  filterExistingModelState(serialized_state) {
    let models = serialized_state.state;
    models = Object.keys(models).filter((model_id) => !this.has_model(model_id)).reduce((res, model_id) => {
      res[model_id] = models[model_id];
      return res;
    }, {});
    return Object.assign(Object.assign({}, serialized_state), { state: models });
  }
};
function serialize_state(models, options = {}) {
  const state = {};
  models.forEach((model) => {
    const model_id = model.model_id;
    const split = remove_buffers(model.serialize(model.get_state(options.drop_defaults)));
    const buffers = split.buffers.map((buffer, index) => {
      return {
        data: bufferToBase64(buffer),
        path: split.buffer_paths[index],
        encoding: "base64"
      };
    });
    state[model_id] = {
      model_name: model.name,
      model_module: model.module,
      model_module_version: model.get("_model_module_version"),
      state: split.state
    };
    if (buffers.length > 0) {
      state[model_id].buffers = buffers;
    }
  });
  return { version_major: 2, version_minor: 0, state };
}

// node_modules/@jupyter-widgets/controls/lib/index.js
var lib_exports3 = {};
__export(lib_exports3, {
  AccordionModel: () => AccordionModel,
  AccordionView: () => AccordionView,
  AudioModel: () => AudioModel,
  AudioView: () => AudioView,
  BaseIntSliderView: () => BaseIntSliderView,
  BoolModel: () => BoolModel,
  BoundedFloatModel: () => BoundedFloatModel,
  BoundedFloatTextModel: () => BoundedFloatTextModel,
  BoundedIntModel: () => BoundedIntModel,
  BoundedIntTextModel: () => BoundedIntTextModel,
  BoxModel: () => BoxModel,
  BoxView: () => BoxView,
  ButtonModel: () => ButtonModel,
  ButtonStyleModel: () => ButtonStyleModel,
  ButtonView: () => ButtonView,
  CheckboxModel: () => CheckboxModel,
  CheckboxStyleModel: () => CheckboxStyleModel,
  CheckboxView: () => CheckboxView,
  ColorPickerModel: () => ColorPickerModel,
  ColorPickerView: () => ColorPickerView,
  ColorsInputModel: () => ColorsInputModel,
  ColorsInputView: () => ColorsInputView,
  ComboboxModel: () => ComboboxModel,
  ComboboxView: () => ComboboxView,
  ControllerAxisModel: () => ControllerAxisModel,
  ControllerAxisView: () => ControllerAxisView,
  ControllerButtonModel: () => ControllerButtonModel,
  ControllerButtonView: () => ControllerButtonView,
  ControllerModel: () => ControllerModel,
  ControllerView: () => ControllerView,
  DatePickerModel: () => DatePickerModel,
  DatePickerView: () => DatePickerView,
  DatetimeModel: () => DatetimeModel,
  DatetimeView: () => DatetimeView,
  DescriptionModel: () => DescriptionModel,
  DescriptionStyleModel: () => DescriptionStyleModel,
  DescriptionView: () => DescriptionView,
  DirectionalLinkModel: () => DirectionalLinkModel,
  DropdownModel: () => DropdownModel,
  DropdownView: () => DropdownView,
  FileUploadModel: () => FileUploadModel,
  FileUploadView: () => FileUploadView,
  FloatLogSliderModel: () => FloatLogSliderModel,
  FloatLogSliderView: () => FloatLogSliderView,
  FloatModel: () => FloatModel,
  FloatProgressModel: () => FloatProgressModel,
  FloatRangeSliderModel: () => FloatRangeSliderModel,
  FloatRangeSliderView: () => FloatRangeSliderView,
  FloatSliderModel: () => FloatSliderModel,
  FloatSliderView: () => FloatSliderView,
  FloatTextModel: () => FloatTextModel,
  FloatTextView: () => FloatTextView,
  FloatsInputModel: () => FloatsInputModel,
  FloatsInputView: () => FloatsInputView,
  GridBoxModel: () => GridBoxModel,
  GridBoxView: () => GridBoxView,
  HBoxModel: () => HBoxModel,
  HBoxView: () => HBoxView,
  HTMLMathModel: () => HTMLMathModel,
  HTMLMathStyleModel: () => HTMLMathStyleModel,
  HTMLMathView: () => HTMLMathView,
  HTMLModel: () => HTMLModel,
  HTMLStyleModel: () => HTMLStyleModel,
  HTMLView: () => HTMLView,
  ImageModel: () => ImageModel,
  ImageView: () => ImageView,
  IntModel: () => IntModel,
  IntProgressModel: () => IntProgressModel,
  IntRangeSliderModel: () => IntRangeSliderModel,
  IntRangeSliderView: () => IntRangeSliderView,
  IntSliderModel: () => IntSliderModel,
  IntSliderView: () => IntSliderView,
  IntTextModel: () => IntTextModel,
  IntTextView: () => IntTextView,
  IntsInputModel: () => IntsInputModel,
  IntsInputView: () => IntsInputView,
  JUPYTER_CONTROLS_VERSION: () => JUPYTER_CONTROLS_VERSION,
  JupyterLuminoAccordionWidget: () => JupyterLuminoAccordionWidget,
  JupyterLuminoTabPanelWidget: () => JupyterLuminoTabPanelWidget,
  LabelModel: () => LabelModel,
  LabelStyleModel: () => LabelStyleModel,
  LabelView: () => LabelView,
  LabeledDOMWidgetModel: () => LabeledDOMWidgetModel,
  LabeledDOMWidgetView: () => LabeledDOMWidgetView,
  LinkModel: () => LinkModel,
  MultipleSelectionModel: () => MultipleSelectionModel,
  NaiveDatetimeModel: () => NaiveDatetimeModel,
  PasswordModel: () => PasswordModel,
  PasswordView: () => PasswordView,
  PlayModel: () => PlayModel,
  PlayView: () => PlayView,
  ProgressStyleModel: () => ProgressStyleModel,
  ProgressView: () => ProgressView,
  RadioButtonsModel: () => RadioButtonsModel,
  RadioButtonsView: () => RadioButtonsView,
  SelectModel: () => SelectModel,
  SelectMultipleModel: () => SelectMultipleModel,
  SelectMultipleView: () => SelectMultipleView,
  SelectView: () => SelectView,
  SelectionContainerModel: () => SelectionContainerModel,
  SelectionModel: () => SelectionModel,
  SelectionRangeSliderModel: () => SelectionRangeSliderModel,
  SelectionRangeSliderView: () => SelectionRangeSliderView,
  SelectionSliderModel: () => SelectionSliderModel,
  SelectionSliderView: () => SelectionSliderView,
  SelectionView: () => SelectionView,
  SliderStyleModel: () => SliderStyleModel,
  StackModel: () => StackModel,
  StackView: () => StackView,
  StringModel: () => StringModel,
  StringView: () => StringView,
  TabModel: () => TabModel,
  TabView: () => TabView,
  TagsInputModel: () => TagsInputModel,
  TagsInputView: () => TagsInputView,
  TextModel: () => TextModel,
  TextStyleModel: () => TextStyleModel,
  TextView: () => TextView,
  TextareaModel: () => TextareaModel,
  TextareaView: () => TextareaView,
  TimeModel: () => TimeModel,
  TimeView: () => TimeView,
  ToggleButtonModel: () => ToggleButtonModel,
  ToggleButtonStyleModel: () => ToggleButtonStyleModel,
  ToggleButtonView: () => ToggleButtonView,
  ToggleButtonsModel: () => ToggleButtonsModel,
  ToggleButtonsStyleModel: () => ToggleButtonsStyleModel,
  ToggleButtonsView: () => ToggleButtonsView,
  VBoxModel: () => VBoxModel,
  VBoxView: () => VBoxView,
  ValidModel: () => ValidModel,
  ValidView: () => ValidView,
  VideoModel: () => VideoModel,
  VideoView: () => VideoView,
  datetime_serializers: () => datetime_serializers,
  deserialize_date: () => deserialize_date,
  deserialize_datetime: () => deserialize_datetime,
  deserialize_naive: () => deserialize_naive,
  deserialize_time: () => deserialize_time,
  escape_html: () => escape_html,
  naive_serializers: () => naive_serializers,
  reject: () => reject2,
  resolvePromisesDict: () => resolvePromisesDict,
  serialize_date: () => serialize_date,
  serialize_datetime: () => serialize_datetime,
  serialize_naive: () => serialize_naive,
  serialize_time: () => serialize_time,
  time_serializers: () => time_serializers,
  typeset: () => typeset,
  uuid: () => uuid,
  version: () => version
});

// node_modules/@jupyter-widgets/controls/lib/utils.js
function typeset(element, text) {
  if (text !== void 0) {
    element.textContent = text;
  }
  if (window.MathJax !== void 0) {
    MathJax.Hub.Queue(["Typeset", MathJax.Hub, element]);
  }
}
function escape_html(text) {
  const esc = document.createElement("div");
  esc.textContent = text;
  return esc.innerHTML;
}
function reject2(message, log) {
  return function promiseRejection(error) {
    if (log) {
      console.error(new Error(message));
    }
    throw error;
  };
}

// node_modules/@jupyter-widgets/controls/lib/version.js
var JUPYTER_CONTROLS_VERSION = "2.0.0";

// node_modules/@jupyter-widgets/controls/lib/widget_description.js
var DescriptionStyleModel = class extends StyleModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "DescriptionStyleModel", _model_module: "@jupyter-widgets/controls", _model_module_version: JUPYTER_CONTROLS_VERSION });
  }
};
DescriptionStyleModel.styleProperties = {
  description_width: {
    selector: ".widget-label",
    attribute: "width",
    default: null
  }
};
var DescriptionModel = class extends DOMWidgetModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "DescriptionModel", _view_name: "DescriptionView", _view_module: "@jupyter-widgets/controls", _model_module: "@jupyter-widgets/controls", _view_module_version: JUPYTER_CONTROLS_VERSION, _model_module_version: JUPYTER_CONTROLS_VERSION, description: "", description_allow_html: false });
  }
};
var DescriptionView = class extends DOMWidgetView {
  render() {
    this.label = document.createElement("label");
    this.el.appendChild(this.label);
    this.label.className = "widget-label";
    this.label.style.display = "none";
    this.listenTo(this.model, "change:description", this.updateDescription);
    this.listenTo(this.model, "change:description_allow_html", this.updateDescription);
    this.listenTo(this.model, "change:tabbable", this.updateTabindex);
    this.updateDescription();
    this.updateTabindex();
    this.updateTooltip();
  }
  typeset(element, text) {
    this.displayed.then(() => {
      var _a;
      const widget_manager = this.model.widget_manager;
      const latexTypesetter = (_a = widget_manager._rendermime) === null || _a === void 0 ? void 0 : _a.latexTypesetter;
      if (latexTypesetter) {
        if (text !== void 0) {
          element.textContent = text;
        }
        latexTypesetter.typeset(element);
      } else {
        return typeset(element, text);
      }
    });
  }
  updateDescription() {
    const description = this.model.get("description");
    if (description.length === 0) {
      this.label.style.display = "none";
    } else {
      if (this.model.get("description_allow_html")) {
        this.label.innerHTML = this.model.widget_manager.inline_sanitize(description);
      } else {
        this.label.textContent = description;
      }
      this.typeset(this.label);
      this.label.style.display = "";
    }
  }
  updateTooltip() {
    if (!this.label)
      return;
    this.label.title = this.model.get("tooltip");
  }
};
var LabeledDOMWidgetModel = class extends DescriptionModel {
};
var LabeledDOMWidgetView = class extends DescriptionView {
};

// node_modules/@jupyter-widgets/controls/lib/widget_core.js
var CoreWidgetModel = class extends WidgetModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "CoreWidgetModel", _view_module: "@jupyter-widgets/controls", _model_module: "@jupyter-widgets/controls", _view_module_version: JUPYTER_CONTROLS_VERSION, _model_module_version: JUPYTER_CONTROLS_VERSION });
  }
};
var CoreDOMWidgetModel = class extends DOMWidgetModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "CoreDOMWidgetModel", _view_module: "@jupyter-widgets/controls", _model_module: "@jupyter-widgets/controls", _view_module_version: JUPYTER_CONTROLS_VERSION, _model_module_version: JUPYTER_CONTROLS_VERSION });
  }
};
var CoreDescriptionModel = class extends DescriptionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "CoreDescriptionModel", _view_module: "@jupyter-widgets/controls", _model_module: "@jupyter-widgets/controls", _view_module_version: JUPYTER_CONTROLS_VERSION, _model_module_version: JUPYTER_CONTROLS_VERSION });
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_link.js
var DirectionalLinkModel = class extends CoreWidgetModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { target: void 0, source: void 0, _model_name: "DirectionalLinkModel" });
  }
  initialize(attributes, options) {
    super.initialize(attributes, options);
    this.on("change", this.updateBindings, this);
    this.updateBindings();
  }
  updateValue(sourceModel, sourceAttr, targetModel, targetAttr) {
    if (this._updating) {
      return;
    }
    this._updating = true;
    try {
      if (targetModel) {
        targetModel.set(targetAttr, sourceModel.get(sourceAttr));
        targetModel.save_changes();
      }
    } finally {
      this._updating = false;
    }
  }
  updateBindings() {
    this.cleanup();
    [this.sourceModel, this.sourceAttr] = this.get("source") || [null, null];
    [this.targetModel, this.targetAttr] = this.get("target") || [null, null];
    if (this.sourceModel) {
      this.listenTo(this.sourceModel, "change:" + this.sourceAttr, () => {
        this.updateValue(this.sourceModel, this.sourceAttr, this.targetModel, this.targetAttr);
      });
      this.updateValue(this.sourceModel, this.sourceAttr, this.targetModel, this.targetAttr);
      this.listenToOnce(this.sourceModel, "destroy", this.cleanup);
    }
    if (this.targetModel) {
      this.listenToOnce(this.targetModel, "destroy", this.cleanup);
    }
  }
  cleanup() {
    if (this.sourceModel) {
      this.stopListening(this.sourceModel, "change:" + this.sourceAttr, void 0);
      this.stopListening(this.sourceModel, "destroy", void 0);
    }
    if (this.targetModel) {
      this.stopListening(this.targetModel, "destroy", void 0);
    }
  }
};
DirectionalLinkModel.serializers = Object.assign(Object.assign({}, CoreWidgetModel.serializers), { target: { deserialize: unpack_models }, source: { deserialize: unpack_models } });
var LinkModel = class extends DirectionalLinkModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "LinkModel" });
  }
  updateBindings() {
    super.updateBindings();
    if (this.targetModel) {
      this.listenTo(this.targetModel, "change:" + this.targetAttr, () => {
        this.updateValue(this.targetModel, this.targetAttr, this.sourceModel, this.sourceAttr);
      });
    }
  }
  cleanup() {
    super.cleanup();
    if (this.targetModel) {
      this.stopListening(this.targetModel, "change:" + this.targetAttr, void 0);
    }
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_bool.js
var CheckboxStyleModel = class extends DescriptionStyleModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "CheckboxStyleModel" });
  }
};
CheckboxStyleModel.styleProperties = Object.assign(Object.assign({}, DescriptionStyleModel.styleProperties), { background: {
  selector: "",
  attribute: "background",
  default: null
} });
var ToggleButtonStyleModel = class extends DescriptionStyleModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "ToggleButtonStyleModel" });
  }
};
ToggleButtonStyleModel.styleProperties = Object.assign(Object.assign({}, DescriptionStyleModel.styleProperties), { font_family: {
  selector: "",
  attribute: "font-family",
  default: ""
}, font_size: {
  selector: "",
  attribute: "font-size",
  default: ""
}, font_style: {
  selector: "",
  attribute: "font-style",
  default: ""
}, font_variant: {
  selector: "",
  attribute: "font-variant",
  default: ""
}, font_weight: {
  selector: "",
  attribute: "font-weight",
  default: ""
}, text_color: {
  selector: "",
  attribute: "color",
  default: ""
}, text_decoration: {
  selector: "",
  attribute: "text-decoration",
  default: ""
} });
var BoolModel = class extends CoreDescriptionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { value: false, disabled: false, _model_name: "BoolModel" });
  }
};
var CheckboxModel = class extends CoreDescriptionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { indent: true, style: null, _view_name: "CheckboxView", _model_name: "CheckboxModel" });
  }
};
var CheckboxView = class extends DescriptionView {
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-inline-hbox");
    this.el.classList.add("widget-checkbox");
    this.label.innerHTML = "&#8203;";
    this.checkboxLabel = document.createElement("label");
    this.checkboxLabel.classList.add("widget-label-basic");
    this.el.appendChild(this.checkboxLabel);
    this.checkbox = document.createElement("input");
    this.checkbox.setAttribute("type", "checkbox");
    this.checkboxLabel.appendChild(this.checkbox);
    this.descriptionSpan = document.createElement("span");
    this.checkboxLabel.appendChild(this.descriptionSpan);
    this.listenTo(this.model, "change:indent", this.updateIndent);
    this.listenTo(this.model, "change:tabbable", this.updateTabindex);
    this.update();
    this.updateDescription();
    this.updateIndent();
    this.updateTabindex();
    this.updateTooltip();
  }
  /**
   * Overridden from super class
   *
   * Update the description span (rather than the label) since
   * we want the description to the right of the checkbox.
   */
  updateDescription() {
    if (this.checkboxLabel == null) {
      return;
    }
    const description = this.model.get("description");
    if (this.model.get("description_allow_html")) {
      this.descriptionSpan.innerHTML = this.model.widget_manager.inline_sanitize(description);
    } else {
      this.descriptionSpan.textContent = description;
    }
    this.typeset(this.descriptionSpan);
    this.descriptionSpan.title = description;
    this.checkbox.title = description;
  }
  /**
   * Update the visibility of the label in the super class
   * to provide the optional indent.
   */
  updateIndent() {
    const indent = this.model.get("indent");
    this.label.style.display = indent ? "" : "none";
  }
  updateTabindex() {
    if (!this.checkbox) {
      return;
    }
    const tabbable = this.model.get("tabbable");
    if (tabbable === true) {
      this.checkbox.setAttribute("tabIndex", "0");
    } else if (tabbable === false) {
      this.checkbox.setAttribute("tabIndex", "-1");
    } else if (tabbable === null) {
      this.checkbox.removeAttribute("tabIndex");
    }
  }
  updateTooltip() {
    if (!this.checkbox)
      return;
    const title = this.model.get("tooltip");
    if (!title) {
      this.checkbox.removeAttribute("title");
    } else if (this.model.get("description").length === 0) {
      this.checkbox.setAttribute("title", title);
    }
  }
  events() {
    return {
      'click input[type="checkbox"]': "_handle_click"
    };
  }
  /**
   * Handles when the checkbox is clicked.
   *
   * Calling model.set will trigger all of the other views of the
   * model to update.
   */
  _handle_click() {
    const value = this.model.get("value");
    this.model.set("value", !value, { updated_view: this });
    this.touch();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed. The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update(options) {
    this.checkbox.checked = this.model.get("value");
    if (options === void 0 || options.updated_view != this) {
      this.checkbox.disabled = this.model.get("disabled");
    }
    return super.update();
  }
  /**
   * Handle message sent to the front end.
   *
   * Used to focus or blur the widget.
   */
  handle_message(content) {
    if (content.do == "focus") {
      this.checkbox.focus();
    } else if (content.do == "blur") {
      this.checkbox.blur();
    }
  }
};
var ToggleButtonModel = class extends BoolModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _view_name: "ToggleButtonView", _model_name: "ToggleButtonModel", tooltip: "", icon: "", button_style: "", style: null });
  }
};
var ToggleButtonView = class _ToggleButtonView extends DOMWidgetView {
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("jupyter-button");
    this.el.classList.add("widget-toggle-button");
    this.listenTo(this.model, "change:button_style", this.update_button_style);
    this.listenTo(this.model, "change:tabbable", this.updateTabindex);
    this.set_button_style();
    this.update();
  }
  update_button_style() {
    this.update_mapped_classes(_ToggleButtonView.class_map, "button_style");
  }
  set_button_style() {
    this.set_mapped_classes(_ToggleButtonView.class_map, "button_style");
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed. The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update(options) {
    if (this.model.get("value")) {
      this.el.classList.add("mod-active");
    } else {
      this.el.classList.remove("mod-active");
    }
    if (options === void 0 || options.updated_view !== this) {
      this.el.disabled = this.model.get("disabled");
      this.el.setAttribute("tabbable", this.model.get("tabbable"));
      this.el.setAttribute("title", this.model.get("tooltip"));
      const description = this.model.get("description");
      const icon = this.model.get("icon");
      if (description.trim().length === 0 && icon.trim().length === 0) {
        this.el.innerHTML = "&nbsp;";
      } else {
        this.el.textContent = "";
        if (icon.trim().length) {
          const i = document.createElement("i");
          this.el.appendChild(i);
          i.classList.add("fa");
          i.classList.add("fa-" + icon);
        }
        this.el.appendChild(document.createTextNode(description));
      }
    }
    this.updateTabindex();
    return super.update();
  }
  events() {
    return {
      // Dictionary of events and their handlers.
      click: "_handle_click"
    };
  }
  /**
   * Handles and validates user input.
   *
   * Calling model.set will trigger all of the other views of the
   * model to update.
   */
  _handle_click(event) {
    event.preventDefault();
    const value = this.model.get("value");
    this.model.set("value", !value, { updated_view: this });
    this.touch();
  }
  preinitialize() {
    this.tagName = "button";
  }
};
ToggleButtonView.class_map = {
  primary: ["mod-primary"],
  success: ["mod-success"],
  info: ["mod-info"],
  warning: ["mod-warning"],
  danger: ["mod-danger"]
};
var ValidModel = class extends BoolModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { readout: "Invalid", _view_name: "ValidView", _model_name: "ValidModel" });
  }
};
var ValidView = class extends DescriptionView {
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-valid");
    this.el.classList.add("widget-inline-hbox");
    this.icon = document.createElement("i");
    this.icon.classList.add("fa", "fa-fw");
    this.el.appendChild(this.icon);
    this.readout = document.createElement("span");
    this.readout.classList.add("widget-valid-readout");
    this.readout.classList.add("widget-readout");
    this.el.appendChild(this.readout);
    this.update();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed.  The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update() {
    this.el.classList.remove("mod-valid");
    this.el.classList.remove("mod-invalid");
    this.icon.classList.remove("fa-check");
    this.icon.classList.remove("fa-times");
    this.readout.textContent = this.model.get("readout");
    if (this.model.get("value")) {
      this.el.classList.add("mod-valid");
      this.icon.classList.add("fa-check");
    } else {
      this.el.classList.add("mod-invalid");
      this.icon.classList.add("fa-times");
    }
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_button.js
var ButtonStyleModel = class extends StyleModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "ButtonStyleModel", _model_module: "@jupyter-widgets/controls", _model_module_version: JUPYTER_CONTROLS_VERSION });
  }
};
ButtonStyleModel.styleProperties = {
  button_color: {
    selector: "",
    attribute: "background-color",
    default: null
  },
  font_family: {
    selector: "",
    attribute: "font-family",
    default: ""
  },
  font_size: {
    selector: "",
    attribute: "font-size",
    default: ""
  },
  font_style: {
    selector: "",
    attribute: "font-style",
    default: ""
  },
  font_variant: {
    selector: "",
    attribute: "font-variant",
    default: ""
  },
  font_weight: {
    selector: "",
    attribute: "font-weight",
    default: ""
  },
  text_color: {
    selector: "",
    attribute: "color",
    default: ""
  },
  text_decoration: {
    selector: "",
    attribute: "text-decoration",
    default: ""
  }
};
var ButtonModel = class extends CoreDOMWidgetModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { description: "", tooltip: "", disabled: false, icon: "", button_style: "", _view_name: "ButtonView", _model_name: "ButtonModel", style: null });
  }
};
var ButtonView = class _ButtonView extends DOMWidgetView {
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("jupyter-button");
    this.el.classList.add("widget-button");
    this.listenTo(this.model, "change:button_style", this.update_button_style);
    this.listenTo(this.model, "change:tabbable", this.updateTabindex);
    this.set_button_style();
    this.update();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed. The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update() {
    this.el.disabled = this.model.get("disabled");
    this.updateTabindex();
    const tooltip = this.model.get("tooltip");
    const description = this.model.get("description");
    const icon = this.model.get("icon");
    this.el.setAttribute("title", tooltip !== null && tooltip !== void 0 ? tooltip : description);
    if (description.length || icon.length) {
      this.el.textContent = "";
      if (icon.length) {
        const i = document.createElement("i");
        i.classList.add("fa");
        i.classList.add(...icon.split(/[\s]+/).filter(Boolean).map((v) => `fa-${v}`));
        if (description.length === 0) {
          i.classList.add("center");
        }
        this.el.appendChild(i);
      }
      this.el.appendChild(document.createTextNode(description));
    }
    return super.update();
  }
  update_button_style() {
    this.update_mapped_classes(_ButtonView.class_map, "button_style");
  }
  set_button_style() {
    this.set_mapped_classes(_ButtonView.class_map, "button_style");
  }
  /**
   * Dictionary of events and handlers
   */
  events() {
    return { click: "_handle_click" };
  }
  /**
   * Handles when the button is clicked.
   */
  _handle_click(event) {
    event.preventDefault();
    this.send({ event: "click" });
  }
  preinitialize() {
    this.tagName = "button";
  }
};
ButtonView.class_map = {
  primary: ["mod-primary"],
  success: ["mod-success"],
  info: ["mod-info"],
  warning: ["mod-warning"],
  danger: ["mod-danger"]
};

// node_modules/@jupyter-widgets/controls/lib/widget_box.js
var import_algorithm3 = require("@lumino/algorithm");
var import_messaging3 = require("@lumino/messaging");
var import_jquery2 = __toESM(require("jquery"));
var BoxModel = class extends CoreDOMWidgetModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _view_name: "BoxView", _model_name: "BoxModel", children: [], box_style: "" });
  }
};
BoxModel.serializers = Object.assign(Object.assign({}, CoreDOMWidgetModel.serializers), { children: { deserialize: unpack_models } });
var HBoxModel = class extends BoxModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _view_name: "HBoxView", _model_name: "HBoxModel" });
  }
};
var VBoxModel = class extends BoxModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _view_name: "VBoxView", _model_name: "VBoxModel" });
  }
};
var BoxView = class _BoxView extends DOMWidgetView {
  _createElement(tagName) {
    this.luminoWidget = new JupyterLuminoPanelWidget({ view: this });
    return this.luminoWidget.node;
  }
  _setElement(el) {
    if (this.el || el !== this.luminoWidget.node) {
      throw new Error("Cannot reset the DOM element.");
    }
    this.el = this.luminoWidget.node;
    this.$el = (0, import_jquery2.default)(this.luminoWidget.node);
  }
  initialize(parameters) {
    super.initialize(parameters);
    this.children_views = new ViewList(this.add_child_model, null, this);
    this.listenTo(this.model, "change:children", this.update_children);
    this.listenTo(this.model, "change:box_style", this.update_box_style);
    this.luminoWidget.addClass("jupyter-widgets");
    this.luminoWidget.addClass("widget-container");
    this.luminoWidget.addClass("widget-box");
  }
  render() {
    super.render();
    this.update_children();
    this.set_box_style();
  }
  update_children() {
    var _a;
    (_a = this.children_views) === null || _a === void 0 ? void 0 : _a.update(this.model.get("children")).then((views) => {
      views.forEach((view) => {
        import_messaging3.MessageLoop.postMessage(view.luminoWidget, Widget.ResizeMessage.UnknownSize);
      });
    });
  }
  update_box_style() {
    this.update_mapped_classes(_BoxView.class_map, "box_style");
  }
  set_box_style() {
    this.set_mapped_classes(_BoxView.class_map, "box_style");
  }
  add_child_model(model) {
    const dummy = new Widget();
    this.luminoWidget.addWidget(dummy);
    return this.create_child_view(model).then((view) => {
      const i = import_algorithm3.ArrayExt.firstIndexOf(this.luminoWidget.widgets, dummy);
      this.luminoWidget.insertWidget(i, view.luminoWidget);
      dummy.dispose();
      return view;
    }).catch(reject("Could not add child view to box", true));
  }
  remove() {
    this.children_views = null;
    super.remove();
  }
};
BoxView.class_map = {
  success: ["alert", "alert-success"],
  info: ["alert", "alert-info"],
  warning: ["alert", "alert-warning"],
  danger: ["alert", "alert-danger"]
};
var HBoxView = class extends BoxView {
  /**
   * Public constructor
   */
  initialize(parameters) {
    super.initialize(parameters);
    this.luminoWidget.addClass("widget-hbox");
  }
};
var VBoxView = class extends BoxView {
  /**
   * Public constructor
   */
  initialize(parameters) {
    super.initialize(parameters);
    this.luminoWidget.addClass("widget-vbox");
  }
};
var GridBoxView = class extends BoxView {
  /**
   * Public constructor
   */
  initialize(parameters) {
    super.initialize(parameters);
    this.luminoWidget.addClass("widget-gridbox");
    this.luminoWidget.removeClass("widget-box");
  }
};
var GridBoxModel = class extends BoxModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _view_name: "GridBoxView", _model_name: "GridBoxModel" });
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_image.js
var ImageModel = class extends CoreDOMWidgetModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "ImageModel", _view_name: "ImageView", format: "png", width: "", height: "", value: new DataView(new ArrayBuffer(0)) });
  }
};
ImageModel.serializers = Object.assign(Object.assign({}, CoreDOMWidgetModel.serializers), { value: {
  serialize: (value) => {
    return new DataView(value.buffer.slice(0));
  }
} });
var ImageView = class extends DOMWidgetView {
  render() {
    super.render();
    this.luminoWidget.addClass("jupyter-widgets");
    this.luminoWidget.addClass("widget-image");
    this.update();
  }
  update() {
    let url;
    const format4 = this.model.get("format");
    const value = this.model.get("value");
    if (format4 !== "url") {
      const blob = new Blob([value], {
        type: `image/${this.model.get("format")}`
      });
      url = URL.createObjectURL(blob);
    } else {
      url = new TextDecoder("utf-8").decode(value.buffer);
    }
    const oldurl = this.el.src;
    this.el.src = url;
    if (oldurl) {
      URL.revokeObjectURL(oldurl);
    }
    const width = this.model.get("width");
    if (width !== void 0 && width.length > 0) {
      this.el.setAttribute("width", width);
    } else {
      this.el.removeAttribute("width");
    }
    const height = this.model.get("height");
    if (height !== void 0 && height.length > 0) {
      this.el.setAttribute("height", height);
    } else {
      this.el.removeAttribute("height");
    }
    return super.update();
  }
  remove() {
    if (this.el.src) {
      URL.revokeObjectURL(this.el.src);
    }
    super.remove();
  }
  preinitialize() {
    this.tagName = "img";
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_video.js
var VideoModel = class extends CoreDOMWidgetModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "VideoModel", _view_name: "VideoView", format: "mp4", width: "", height: "", autoplay: true, loop: true, controls: true, value: new DataView(new ArrayBuffer(0)) });
  }
};
VideoModel.serializers = Object.assign(Object.assign({}, CoreDOMWidgetModel.serializers), { value: {
  serialize: (value) => {
    return new DataView(value.buffer.slice(0));
  }
} });
var VideoView = class extends DOMWidgetView {
  render() {
    super.render();
    this.luminoWidget.addClass("jupyter-widgets");
    this.luminoWidget.addClass("widget-image");
    this.update();
  }
  update() {
    let url;
    const format4 = this.model.get("format");
    const value = this.model.get("value");
    if (format4 !== "url") {
      const blob = new Blob([value], {
        type: `video/${this.model.get("format")}`
      });
      url = URL.createObjectURL(blob);
    } else {
      url = new TextDecoder("utf-8").decode(value.buffer);
    }
    const oldurl = this.el.src;
    this.el.src = url;
    if (oldurl) {
      URL.revokeObjectURL(oldurl);
    }
    const width = this.model.get("width");
    if (width !== void 0 && width.length > 0) {
      this.el.setAttribute("width", width);
    } else {
      this.el.removeAttribute("width");
    }
    const height = this.model.get("height");
    if (height !== void 0 && height.length > 0) {
      this.el.setAttribute("height", height);
    } else {
      this.el.removeAttribute("height");
    }
    this.el.loop = this.model.get("loop");
    this.el.autoplay = this.model.get("autoplay");
    this.el.controls = this.model.get("controls");
    return super.update();
  }
  remove() {
    if (this.el.src) {
      URL.revokeObjectURL(this.el.src);
    }
    super.remove();
  }
  preinitialize() {
    this.tagName = "video";
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_audio.js
var AudioModel = class extends CoreDOMWidgetModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "AudioModel", _view_name: "AudioView", format: "mp3", autoplay: true, loop: true, controls: true, value: new DataView(new ArrayBuffer(0)) });
  }
};
AudioModel.serializers = Object.assign(Object.assign({}, CoreDOMWidgetModel.serializers), { value: {
  serialize: (value) => {
    return new DataView(value.buffer.slice(0));
  }
} });
var AudioView = class extends DOMWidgetView {
  render() {
    super.render();
    this.luminoWidget.addClass("jupyter-widgets");
    this.update();
  }
  update() {
    let url;
    const format4 = this.model.get("format");
    const value = this.model.get("value");
    if (format4 !== "url") {
      const blob = new Blob([value], {
        type: `audio/${this.model.get("format")}`
      });
      url = URL.createObjectURL(blob);
    } else {
      url = new TextDecoder("utf-8").decode(value.buffer);
    }
    const oldurl = this.el.src;
    this.el.src = url;
    if (oldurl) {
      URL.revokeObjectURL(oldurl);
    }
    this.el.loop = this.model.get("loop");
    this.el.autoplay = this.model.get("autoplay");
    this.el.controls = this.model.get("controls");
    return super.update();
  }
  remove() {
    if (this.el.src) {
      URL.revokeObjectURL(this.el.src);
    }
    super.remove();
  }
  preinitialize() {
    this.tagName = "audio";
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_color.js
var named_colors = {
  aliceblue: "#f0f8ff",
  antiquewhite: "#faebd7",
  aqua: "#00ffff",
  aquamarine: "#7fffd4",
  azure: "#f0ffff",
  beige: "#f5f5dc",
  bisque: "#ffe4c4",
  black: "#000000",
  blanchedalmond: "#ffebcd",
  blue: "#0000ff",
  blueviolet: "#8a2be2",
  brown: "#a52a2a",
  burlywood: "#deb887",
  cadetblue: "#5f9ea0",
  chartreuse: "#7fff00",
  chocolate: "#d2691e",
  coral: "#ff7f50",
  cornflowerblue: "#6495ed",
  cornsilk: "#fff8dc",
  crimson: "#dc143c",
  cyan: "#00ffff",
  darkblue: "#00008b",
  darkcyan: "#008b8b",
  darkgoldenrod: "#b8860b",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
  darkgreen: "#006400",
  darkkhaki: "#bdb76b",
  darkmagenta: "#8b008b",
  darkolivegreen: "#556b2f",
  darkorange: "#ff8c00",
  darkorchid: "#9932cc",
  darkred: "#8b0000",
  darksalmon: "#e9967a",
  darkseagreen: "#8fbc8f",
  darkslateblue: "#483d8b",
  darkslategray: "#2f4f4f",
  darkslategrey: "#2f4f4f",
  darkturquoise: "#00ced1",
  darkviolet: "#9400d3",
  deeppink: "#ff1493",
  deepskyblue: "#00bfff",
  dimgray: "#696969",
  dimgrey: "#696969",
  dodgerblue: "#1e90ff",
  firebrick: "#b22222",
  floralwhite: "#fffaf0",
  forestgreen: "#228b22",
  fuchsia: "#ff00ff",
  gainsboro: "#dcdcdc",
  ghostwhite: "#f8f8ff",
  gold: "#ffd700",
  goldenrod: "#daa520",
  gray: "#808080",
  grey: "#808080",
  green: "#008000",
  greenyellow: "#adff2f",
  honeydew: "#f0fff0",
  hotpink: "#ff69b4",
  indianred: "#cd5c5c",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  lavenderblush: "#fff0f5",
  lawngreen: "#7cfc00",
  lemonchiffon: "#fffacd",
  lightblue: "#add8e6",
  lightcoral: "#f08080",
  lightcyan: "#e0ffff",
  lightgoldenrodyellow: "#fafad2",
  lightgreen: "#90ee90",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  lightpink: "#ffb6c1",
  lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa",
  lightskyblue: "#87cefa",
  lightslategray: "#778899",
  lightslategrey: "#778899",
  lightsteelblue: "#b0c4de",
  lightyellow: "#ffffe0",
  lime: "#00ff00",
  limegreen: "#32cd32",
  linen: "#faf0e6",
  magenta: "#ff00ff",
  maroon: "#800000",
  mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd",
  mediumorchid: "#ba55d3",
  mediumpurple: "#9370db",
  mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee",
  mediumspringgreen: "#00fa9a",
  mediumturquoise: "#48d1cc",
  mediumvioletred: "#c71585",
  midnightblue: "#191970",
  mintcream: "#f5fffa",
  mistyrose: "#ffe4e1",
  moccasin: "#ffe4b5",
  navajowhite: "#ffdead",
  navy: "#000080",
  oldlace: "#fdf5e6",
  olive: "#808000",
  olivedrab: "#6b8e23",
  orange: "#ffa500",
  orangered: "#ff4500",
  orchid: "#da70d6",
  palegoldenrod: "#eee8aa",
  palegreen: "#98fb98",
  paleturquoise: "#afeeee",
  palevioletred: "#db7093",
  papayawhip: "#ffefd5",
  peachpuff: "#ffdab9",
  peru: "#cd853f",
  pink: "#ffc0cb",
  plum: "#dda0dd",
  powderblue: "#b0e0e6",
  purple: "#800080",
  red: "#ff0000",
  rosybrown: "#bc8f8f",
  royalblue: "#4169e1",
  saddlebrown: "#8b4513",
  salmon: "#fa8072",
  sandybrown: "#f4a460",
  seagreen: "#2e8b57",
  seashell: "#fff5ee",
  sienna: "#a0522d",
  silver: "#c0c0c0",
  skyblue: "#87ceeb",
  slateblue: "#6a5acd",
  slategray: "#708090",
  slategrey: "#708090",
  snow: "#fffafa",
  springgreen: "#00ff7f",
  steelblue: "#4682b4",
  tan: "#d2b48c",
  teal: "#008080",
  thistle: "#d8bfd8",
  tomato: "#ff6347",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  white: "#ffffff",
  whitesmoke: "#f5f5f5",
  yellow: "#ffff00",
  yellowgreen: "#9acd32"
};
var ColorPickerModel = class extends CoreDescriptionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { value: "black", concise: false, _model_name: "ColorPickerModel", _view_name: "ColorPickerView" });
  }
};
var ColorPickerView = class extends DescriptionView {
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-inline-hbox");
    this.el.classList.add("widget-colorpicker");
    this._color_container = document.createElement("div");
    this._color_container.className = "widget-inline-hbox widget-colorpicker-input";
    this.el.appendChild(this._color_container);
    this._textbox = document.createElement("input");
    this._textbox.setAttribute("type", "text");
    this._textbox.id = this.label.htmlFor = uuid();
    this._color_container.appendChild(this._textbox);
    this._textbox.value = this.model.get("value");
    this._colorpicker = document.createElement("input");
    this._colorpicker.setAttribute("type", "color");
    this._color_container.appendChild(this._colorpicker);
    this.listenTo(this.model, "change:value", this._update_value);
    this.listenTo(this.model, "change:concise", this._update_concise);
    this._update_concise();
    this._update_value();
    this.update();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed. The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update(options) {
    if (options === void 0 || options.updated_view != this) {
      const disabled = this.model.get("disabled");
      this._textbox.disabled = disabled;
      this._colorpicker.disabled = disabled;
    }
    return super.update();
  }
  events() {
    void this._picker_change;
    void this._text_change;
    return {
      'change [type="color"]': "_picker_change",
      'change [type="text"]': "_text_change"
    };
  }
  _update_value() {
    const value = this.model.get("value");
    this._colorpicker.value = color2hex(value);
    this._textbox.value = value;
  }
  _update_concise() {
    const concise = this.model.get("concise");
    if (concise) {
      this.el.classList.add("concise");
      this._textbox.style.display = "none";
    } else {
      this.el.classList.remove("concise");
      this._textbox.style.display = "";
    }
  }
  _picker_change() {
    this.model.set("value", this._colorpicker.value);
    this.touch();
  }
  _text_change() {
    const value = this._validate_color(this._textbox.value, this.model.get("value"));
    this.model.set("value", value);
    this.touch();
  }
  _validate_color(color2, fallback) {
    return color2.match(/#[a-fA-F0-9]{3}(?:[a-fA-F0-9]{3})?$/) || named_colors[color2.toLowerCase()] ? color2 : fallback;
  }
};
function color2hex(color2) {
  return named_colors[color2.toLowerCase()] || rgb3_to_rgb6(color2);
}
function rgb3_to_rgb6(rgb) {
  if (rgb.length === 7) {
    return rgb;
  } else {
    return "#" + rgb.charAt(1) + rgb.charAt(1) + rgb.charAt(2) + rgb.charAt(2) + rgb.charAt(3) + rgb.charAt(3);
  }
}

// node_modules/@jupyter-widgets/controls/lib/widget_date.js
function serialize_date(value) {
  if (value === null) {
    return null;
  } else {
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth(),
      date: value.getUTCDate()
    };
  }
}
function deserialize_date(value) {
  if (value === null) {
    return null;
  } else {
    const date = /* @__PURE__ */ new Date();
    date.setUTCFullYear(value.year, value.month, value.date);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
}
var DatePickerModel = class extends CoreDescriptionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { value: null, _model_name: "DatePickerModel", _view_name: "DatePickerView" });
  }
};
DatePickerModel.serializers = Object.assign(Object.assign({}, CoreDescriptionModel.serializers), { value: {
  serialize: serialize_date,
  deserialize: deserialize_date
} });
var DatePickerView = class extends DescriptionView {
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-inline-hbox");
    this.el.classList.add("widget-datepicker");
    this._datepicker = document.createElement("input");
    this._datepicker.setAttribute("type", "date");
    this._datepicker.id = this.label.htmlFor = uuid();
    this.el.appendChild(this._datepicker);
    this.listenTo(this.model, "change:value", this._update_value);
    this._update_value();
    this.update();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed. The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update(options) {
    if (options === void 0 || options.updated_view !== this) {
      this._datepicker.disabled = this.model.get("disabled");
    }
    return super.update();
  }
  events() {
    void this._picker_change;
    void this._picker_focusout;
    return {
      'change [type="date"]': "_picker_change",
      'focusout [type="date"]': "_picker_focusout"
    };
  }
  _update_value() {
    const value = this.model.get("value");
    this._datepicker.valueAsDate = value;
  }
  _picker_change() {
    if (!this._datepicker.validity.badInput) {
      this.model.set("value", this._datepicker.valueAsDate);
      this.touch();
    }
  }
  _picker_focusout() {
    if (this._datepicker.validity.badInput) {
      this.model.set("value", null);
      this.touch();
    }
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_time.js
var PARSER = /(\d\d):(\d\d)(:(\d\d)(.(\d{1,3})\d*)?)?/;
function serialize_time(value) {
  if (value === null) {
    return null;
  } else {
    const res = PARSER.exec(value);
    if (res === null) {
      return null;
    }
    return {
      hours: Math.min(23, parseInt(res[1], 10)),
      minutes: Math.min(59, parseInt(res[2], 10)),
      seconds: res[4] ? Math.min(59, parseInt(res[4], 10)) : 0,
      milliseconds: res[6] ? parseInt(res[6], 10) : 0
    };
  }
}
function deserialize_time(value) {
  if (value === null) {
    return null;
  } else {
    const parts = [
      `${value.hours.toString().padStart(2, "0")}:${value.minutes.toString().padStart(2, "0")}`
    ];
    if (value.seconds > 0 || value.milliseconds > 0) {
      parts.push(`:${value.seconds.toString().padStart(2, "0")}`);
      if (value.milliseconds > 0) {
        parts.push(`.${value.milliseconds.toString().padStart(3, "0")}`);
      }
    }
    return parts.join("");
  }
}
var time_serializers = {
  serialize: serialize_time,
  deserialize: deserialize_time
};
var TimeModel = class _TimeModel extends CoreDescriptionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: _TimeModel.model_name, _view_name: _TimeModel.view_name, value: null, disabled: false, min: null, max: null, step: 60 });
  }
};
TimeModel.serializers = Object.assign(Object.assign({}, CoreDescriptionModel.serializers), { value: time_serializers, min: time_serializers, max: time_serializers });
TimeModel.model_name = "TimeModel";
TimeModel.view_name = "TimeView";
var TimeView = class extends DescriptionView {
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-inline-hbox");
    this.el.classList.add("widget-timepicker");
    this._timepicker = document.createElement("input");
    this._timepicker.setAttribute("type", "time");
    this._timepicker.id = this.label.htmlFor = uuid();
    this.el.appendChild(this._timepicker);
    this.listenTo(this.model, "change:value", this._update_value);
    this.listenTo(this.model, "change", this.update2);
    this._update_value();
    this.update2();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed. The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update2(model, options) {
    if (options === void 0 || options.updated_view !== this) {
      this._timepicker.disabled = this.model.get("disabled");
      this._timepicker.min = this.model.get("min");
      this._timepicker.max = this.model.get("max");
      this._timepicker.step = this.model.get("step");
    }
    return super.update();
  }
  events() {
    void this._picker_change;
    void this._picker_focusout;
    return {
      'change [type="time"]': "_picker_change",
      'focusout [type="time"]': "_picker_focusout"
    };
  }
  _update_value(model, newValue, options) {
    if (options === void 0 || options.updated_view !== this) {
      this._timepicker.value = this.model.get("value");
    }
  }
  _picker_change() {
    if (!this._timepicker.validity.badInput) {
      this.model.set("value", this._timepicker.value, { updated_view: this });
      this.touch();
    }
  }
  _picker_focusout() {
    if (this._timepicker.validity.badInput) {
      this.model.set("value", null, { updated_view: this });
      this.touch();
    }
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_datetime.js
function serialize_datetime(value) {
  if (value === null) {
    return null;
  } else {
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth(),
      date: value.getUTCDate(),
      hours: value.getUTCHours(),
      minutes: value.getUTCMinutes(),
      seconds: value.getUTCSeconds(),
      milliseconds: value.getUTCMilliseconds()
    };
  }
}
function deserialize_datetime(value) {
  if (value === null) {
    return null;
  } else {
    const date = /* @__PURE__ */ new Date();
    date.setUTCFullYear(value.year, value.month, value.date);
    date.setUTCHours(value.hours, value.minutes, value.seconds, value.milliseconds);
    return date;
  }
}
var datetime_serializers = {
  serialize: serialize_datetime,
  deserialize: deserialize_datetime
};
var DatetimeModel = class extends CoreDescriptionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "DatetimeModel", _view_name: "DatetimeView", value: null, disabled: false, min: null, max: null });
  }
};
DatetimeModel.serializers = Object.assign(Object.assign({}, CoreDescriptionModel.serializers), { value: datetime_serializers, min: datetime_serializers, max: datetime_serializers });
var DatetimeView = class extends DescriptionView {
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-inline-hbox");
    this.el.classList.add("widget-datetimepicker");
    const test = document.createElement("input");
    test.type = "datetime-local";
    if (test.type === "text") {
      this._datepicker = document.createElement("input");
      this._datepicker.setAttribute("type", "date");
      this._datepicker.id = this.label.htmlFor = uuid();
      this._timepicker = document.createElement("input");
      this._timepicker.setAttribute("type", "time");
      this._timepicker.id = uuid();
      this.el.appendChild(this._datepicker);
      this.el.appendChild(this._timepicker);
    } else {
      this._datetimepicker = test;
      this._datetimepicker.id = this.label.htmlFor = uuid();
      this.el.appendChild(this._datetimepicker);
    }
    this.listenTo(this.model, "change:value", this._update_value);
    this.listenTo(this.model, "change", this.update2);
    this._update_value();
    this.update2();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed. The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update2(model, options) {
    if (options === void 0 || options.updated_view !== this) {
      const min = this.model.get("min");
      const max2 = this.model.get("max");
      if (this._datetimepicker) {
        this._datetimepicker.disabled = this.model.get("disabled");
        this._datetimepicker.min = Private5.dt_as_dt_string(min);
        this._datetimepicker.max = Private5.dt_as_dt_string(max2);
      } else {
        this._datepicker.disabled = this.model.get("disabled");
        this._datepicker.min = Private5.dt_as_date_string(min);
        this._datepicker.max = Private5.dt_as_date_string(max2);
        this._timepicker.disabled = this.model.get("disabled");
      }
    }
  }
  events() {
    void this._picker_change;
    void this._picker_focusout;
    return {
      'change [type="date"]': "_picker_change",
      'change [type="time"]': "_picker_change",
      'change [type="datetime-local"]': "_picker_change",
      'focusout [type="date"]': "_picker_focusout",
      'focusout [type="datetime-local"]': "_picker_focusout",
      'focusout [type="time"]': "_picker_focusout"
    };
  }
  _update_value(model, newValue, options) {
    if (options === void 0 || options.updated_view !== this) {
      const value = this.model.get("value");
      if (this._datetimepicker) {
        this._datetimepicker.value = Private5.dt_as_dt_string(value);
      } else {
        this._datepicker.valueAsDate = value;
        this._timepicker.value = Private5.dt_as_time_string(value);
      }
    }
  }
  _picker_change() {
    if (this._datetimepicker) {
      if (!this._datetimepicker.validity.badInput) {
        const v = this._datetimepicker.value;
        let date = v ? new Date(v) : null;
        if (date && isNaN(date.valueOf())) {
          date = null;
        }
        this.model.set("value", date, { updated_view: this });
        this.touch();
      }
    } else {
      if (!this._datepicker.validity.badInput && !this._timepicker.validity.badInput) {
        const date = this._datepicker.valueAsDate;
        const time = serialize_time(this._timepicker.value);
        if (date !== null && time !== null) {
          date.setHours(time.hours, time.minutes, time.seconds, time.milliseconds);
        }
        this.model.set("value", time !== null && date, { updated_view: this });
        this.touch();
      }
    }
  }
  _picker_focusout() {
    const pickers = [this._datetimepicker, this._datepicker, this._timepicker];
    if (pickers.some((p) => p && p.validity.badInput)) {
      this.model.set("value", null);
      this.touch();
    }
  }
};
var Private5;
(function(Private6) {
  function dt_as_dt_string(value) {
    if (value === null) {
      return "";
    }
    const parts = [];
    parts.push(`${value.getFullYear().toString().padStart(4, "0")}`);
    parts.push(`-${(value.getMonth() + 1).toString().padStart(2, "0")}`);
    parts.push(`-${value.getDate().toString().padStart(2, "0")}`);
    parts.push(`T${value.getHours().toString().padStart(2, "0")}`);
    parts.push(`:${value.getMinutes().toString().padStart(2, "0")}`);
    if (value.getSeconds() > 0 || value.getMilliseconds() > 0) {
      parts.push(`:${value.getSeconds().toString().padStart(2, "0")}`);
      if (value.getMilliseconds() > 0) {
        parts.push(`.${value.getMilliseconds().toString().padStart(3, "0")}`);
      }
    }
    return parts.join("");
  }
  Private6.dt_as_dt_string = dt_as_dt_string;
  function dt_as_date_string(value) {
    return value ? dt_as_dt_string(value).split("T", 2)[0] : "";
  }
  Private6.dt_as_date_string = dt_as_date_string;
  function dt_as_time_string(value) {
    return value ? dt_as_dt_string(value).split("T", 2)[1] : "";
  }
  Private6.dt_as_time_string = dt_as_time_string;
})(Private5 || (Private5 = {}));
function serialize_naive(value) {
  if (value === null) {
    return null;
  } else {
    return {
      year: value.getFullYear(),
      month: value.getMonth(),
      date: value.getDate(),
      hours: value.getHours(),
      minutes: value.getMinutes(),
      seconds: value.getSeconds(),
      milliseconds: value.getMilliseconds()
    };
  }
}
function deserialize_naive(value) {
  if (value === null) {
    return null;
  } else {
    const date = /* @__PURE__ */ new Date();
    date.setFullYear(value.year, value.month, value.date);
    date.setHours(value.hours, value.minutes, value.seconds, value.milliseconds);
    return date;
  }
}
var naive_serializers = {
  serialize: serialize_naive,
  deserialize: deserialize_naive
};
var NaiveDatetimeModel = class extends DatetimeModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "NaiveDatetimeModel" });
  }
};
NaiveDatetimeModel.serializers = Object.assign(Object.assign({}, CoreDescriptionModel.serializers), { value: naive_serializers, min: naive_serializers, max: naive_serializers });

// node_modules/@jupyter-widgets/controls/lib/widget_int.js
var import_d3_format = require("d3-format");
var import_nouislider = __toESM(require("nouislider"));
var IntModel = class extends CoreDescriptionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "IntModel", value: 0 });
  }
};
var BoundedIntModel = class extends IntModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "BoundedIntModel", max: 100, min: 0 });
  }
};
var SliderStyleModel = class extends DescriptionStyleModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "SliderStyleModel" });
  }
};
SliderStyleModel.styleProperties = Object.assign(Object.assign({}, DescriptionStyleModel.styleProperties), { handle_color: {
  selector: ".noUi-handle",
  attribute: "background-color",
  default: null
} });
var IntSliderModel = class extends BoundedIntModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "IntSliderModel", _view_name: "IntSliderView", step: 1, orientation: "horizontal", readout: true, readout_format: "d", continuous_update: true, style: null, disabled: false });
  }
  initialize(attributes, options) {
    super.initialize(attributes, options);
    this.on("change:readout_format", this.update_readout_format, this);
    this.update_readout_format();
  }
  update_readout_format() {
    this.readout_formatter = (0, import_d3_format.format)(this.get("readout_format"));
  }
};
var IntRangeSliderModel = class extends IntSliderModel {
};
var BaseIntSliderView = class extends DescriptionView {
  constructor() {
    super(...arguments);
    this._parse_value = parseInt;
  }
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-inline-hbox");
    this.el.classList.add("widget-slider");
    this.el.classList.add("widget-hslider");
    this.$slider = document.createElement("div");
    this.$slider.classList.add("slider");
    this.slider_container = document.createElement("div");
    this.slider_container.classList.add("slider-container");
    this.slider_container.appendChild(this.$slider);
    this.el.appendChild(this.slider_container);
    this.readout = document.createElement("div");
    this.el.appendChild(this.readout);
    this.readout.classList.add("widget-readout");
    this.readout.contentEditable = "true";
    this.readout.style.display = "none";
    this.createSlider();
    this.model.on("change:orientation", this.regenSlider, this);
    this.model.on("change:max", this.updateSliderOptions, this);
    this.model.on("change:min", this.updateSliderOptions, this);
    this.model.on("change:step", this.updateSliderOptions, this);
    this.model.on("change:value", this.updateSliderValue, this);
    this.update();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed.  The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update(options) {
    if (options === void 0 || options.updated_view !== this) {
      if (this.model.get("disabled")) {
        this.readout.contentEditable = "false";
        this.$slider.setAttribute("disabled", true);
      } else {
        this.readout.contentEditable = "true";
        this.$slider.removeAttribute("disabled");
      }
      const orientation = this.model.get("orientation");
      if (orientation === "vertical") {
        this.el.classList.remove("widget-hslider");
        this.el.classList.add("widget-vslider");
        this.el.classList.remove("widget-inline-hbox");
        this.el.classList.add("widget-inline-vbox");
      } else {
        this.el.classList.remove("widget-vslider");
        this.el.classList.add("widget-hslider");
        this.el.classList.remove("widget-inline-vbox");
        this.el.classList.add("widget-inline-hbox");
      }
      const readout = this.model.get("readout");
      if (readout) {
        this.readout.style.display = "";
        this.displayed.then(() => {
          if (this.readout_overflow()) {
            this.readout.classList.add("overflow");
          } else {
            this.readout.classList.remove("overflow");
          }
        });
      } else {
        this.readout.style.display = "none";
      }
    }
    return super.update();
  }
  /**
   * Returns true if the readout box content overflows.
   */
  readout_overflow() {
    return this.readout.scrollWidth > this.readout.clientWidth;
  }
  events() {
    return {
      // Dictionary of events and their handlers.
      "blur [contentEditable=true]": "handleTextChange",
      "keydown [contentEditable=true]": "handleKeyDown"
    };
  }
  handleKeyDown(e) {
    if (e.keyCode === 13) {
      e.preventDefault();
      this.handleTextChange();
    }
  }
  /**
   * Create a new noUiSlider object
   */
  createSlider() {
    const orientation = this.model.get("orientation");
    const behavior = this.model.get("behavior");
    import_nouislider.default.create(this.$slider, {
      start: this.model.get("value"),
      connect: true,
      behaviour: behavior,
      range: {
        min: this.model.get("min"),
        max: this.model.get("max")
      },
      step: this.model.get("step"),
      animate: false,
      orientation,
      direction: orientation === "horizontal" ? "ltr" : "rtl",
      format: {
        from: (value) => Number(value),
        to: (value) => this._validate_slide_value(value)
      }
    });
    this.$slider.noUiSlider.on("update", (values, handle) => {
      this.handleSliderUpdateEvent(values, handle);
    });
    this.$slider.noUiSlider.on("change", (values, handle) => {
      this.handleSliderChangeEvent(values, handle);
    });
  }
  /**
   * Recreate/Regenerate a slider object
   * noUiSlider does not support in-place mutation of the orientation
   * state. We therefore need to destroy the current instance
   * and create a new one with the new properties. This is
   * handled in a separate function and has a dedicated event
   * handler.
   */
  regenSlider(e) {
    this.$slider.noUiSlider.destroy();
    this.createSlider();
  }
  /**
   * Validate the value of the slider before sending it to the back-end
   * and applying it to the other views on the page.
   */
  _validate_slide_value(x) {
    return Math.round(x);
  }
};
var IntRangeSliderView = class extends BaseIntSliderView {
  constructor() {
    super(...arguments);
    this._range_regex = /^\s*([+-]?\d+)\s*[-:–]\s*([+-]?\d+)/;
  }
  update(options) {
    super.update(options);
    const value = this.model.get("value");
    this.readout.textContent = this.valueToString(value);
    if (this.model.get("value") !== value) {
      this.model.set("value", value, { updated_view: this });
      this.touch();
    }
  }
  /**
   * Write value to a string
   */
  valueToString(value) {
    const format4 = this.model.readout_formatter;
    return value.map(function(v) {
      return format4(v);
    }).join(" \u2013 ");
  }
  /**
   * Parse value from a string
   */
  stringToValue(text) {
    if (text === null) {
      return null;
    }
    const match = this._range_regex.exec(text);
    if (match) {
      return [this._parse_value(match[1]), this._parse_value(match[2])];
    } else {
      return null;
    }
  }
  handleTextChange() {
    let value = this.stringToValue(this.readout.textContent);
    const vmin = this.model.get("min");
    const vmax = this.model.get("max");
    if (value === null || isNaN(value[0]) || isNaN(value[1]) || value[0] > value[1]) {
      this.readout.textContent = this.valueToString(this.model.get("value"));
    } else {
      value = [
        Math.max(Math.min(value[0], vmax), vmin),
        Math.max(Math.min(value[1], vmax), vmin)
      ];
      if (value[0] !== this.model.get("value")[0] || value[1] !== this.model.get("value")[1]) {
        this.readout.textContent = this.valueToString(value);
        this.model.set("value", value);
        this.touch();
      } else {
        this.readout.textContent = this.valueToString(this.model.get("value"));
      }
    }
  }
  /**
   * Called when the slider handle is released after dragging,
   * or by tapping or moving by the arrow keys.
   */
  handleSliderChangeEvent(values, handle) {
    const actual_value = values.map(this._validate_slide_value);
    this.readout.textContent = this.valueToString(actual_value);
    this.handleSliderChanged(values, handle);
  }
  /**
   * Called whilst the slider is dragged, tapped or moved by the arrow keys.
   */
  handleSliderUpdateEvent(values, handle) {
    const actual_value = values.map(this._validate_slide_value);
    this.readout.textContent = this.valueToString(actual_value);
    if (this.model.get("continuous_update")) {
      this.handleSliderChanged(values, handle);
    }
  }
  handleSliderChanged(values, handle) {
    const actual_value = values.map(this._validate_slide_value);
    this.model.set("value", actual_value, { updated_view: this });
    this.touch();
  }
  updateSliderOptions(e) {
    this.$slider.noUiSlider.updateOptions({
      start: this.model.get("value"),
      range: {
        min: this.model.get("min"),
        max: this.model.get("max")
      },
      step: this.model.get("step")
    });
  }
  updateSliderValue(model, _, options) {
    if (options.updated_view === this) {
      return;
    }
    const prev_value = this.$slider.noUiSlider.get();
    const value = this.model.get("value");
    if (prev_value[0] !== value[0] || prev_value[1] !== value[1]) {
      this.$slider.noUiSlider.set(value);
    }
  }
};
var IntSliderView = class extends BaseIntSliderView {
  update(options) {
    super.update(options);
    const min = this.model.get("min");
    const max2 = this.model.get("max");
    let value = this.model.get("value");
    if (value > max2) {
      value = max2;
    } else if (value < min) {
      value = min;
    }
    this.readout.textContent = this.valueToString(value);
    if (this.model.get("value") !== value) {
      this.model.set("value", value, { updated_view: this });
      this.touch();
    }
  }
  valueToString(value) {
    const format4 = this.model.readout_formatter;
    return format4(value);
  }
  stringToValue(text) {
    return this._parse_value(text);
  }
  handleTextChange() {
    var _a;
    let value = this.stringToValue((_a = this.readout.textContent) !== null && _a !== void 0 ? _a : "");
    const vmin = this.model.get("min");
    const vmax = this.model.get("max");
    if (isNaN(value)) {
      this.readout.textContent = this.valueToString(this.model.get("value"));
    } else {
      value = Math.max(Math.min(value, vmax), vmin);
      if (value !== this.model.get("value")) {
        this.readout.textContent = this.valueToString(value);
        this.model.set("value", value);
        this.touch();
      } else {
        this.readout.textContent = this.valueToString(this.model.get("value"));
      }
    }
  }
  handleSliderChangeEvent(values, handle) {
    const actual_value = values.map(this._validate_slide_value);
    this.readout.textContent = this.valueToString(actual_value);
    this.handleSliderChanged(values, handle);
  }
  handleSliderUpdateEvent(values, handle) {
    const actual_value = values.map(this._validate_slide_value);
    this.readout.textContent = this.valueToString(actual_value);
    if (this.model.get("continuous_update")) {
      this.handleSliderChanged(values, handle);
    }
  }
  handleSliderChanged(values, handle) {
    const actual_value = this._validate_slide_value(values[handle]);
    const model_value = this.model.get("value");
    if (parseFloat(model_value) !== actual_value) {
      this.model.set("value", actual_value, { updated_view: this });
      this.touch();
    }
  }
  updateSliderOptions(e) {
    this.$slider.noUiSlider.updateOptions({
      start: this.model.get("value"),
      range: {
        min: this.model.get("min"),
        max: this.model.get("max")
      },
      step: this.model.get("step")
    });
  }
  updateSliderValue(model, _, options) {
    if (options.updated_view === this) {
      return;
    }
    const prev_value = this.$slider.noUiSlider.get();
    const value = this.model.get("value");
    if (prev_value !== value) {
      this.$slider.noUiSlider.set(value);
    }
  }
};
var IntTextModel = class extends IntModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "IntTextModel", _view_name: "IntTextView", disabled: false, continuous_update: false });
  }
};
var BoundedIntTextModel = class extends BoundedIntModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "BoundedIntTextModel", _view_name: "IntTextView", disabled: false, continuous_update: false, step: 1 });
  }
};
var IntTextView = class extends DescriptionView {
  constructor() {
    super(...arguments);
    this._parse_value = parseInt;
    this._default_step = "1";
  }
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-inline-hbox");
    this.el.classList.add("widget-text");
    this.textbox = document.createElement("input");
    this.textbox.type = "number";
    this.textbox.required = true;
    this.textbox.id = this.label.htmlFor = uuid();
    this.el.appendChild(this.textbox);
    this.update();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed.  The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update(options) {
    if (options === void 0 || options.updated_view !== this) {
      const value = this.model.get("value");
      if (this._parse_value(this.textbox.value) !== value) {
        this.textbox.value = value.toString();
      }
      if (this.model.get("min") !== void 0) {
        this.textbox.min = this.model.get("min");
      }
      if (this.model.get("max") !== void 0) {
        this.textbox.max = this.model.get("max");
      }
      if (this.model.get("step") !== void 0 && this.model.get("step") !== null) {
        this.textbox.step = this.model.get("step");
      } else {
        this.textbox.step = this._default_step;
      }
      this.textbox.disabled = this.model.get("disabled");
    }
    return super.update();
  }
  events() {
    return {
      "keydown input": "handleKeyDown",
      "keypress input": "handleKeypress",
      "keyup input": "handleKeyUp",
      "input input": "handleChanging",
      "change input": "handleChanged"
    };
  }
  /**
   * Handle key down
   *
   * Stop propagation so the event isn't sent to the application.
   */
  handleKeyDown(e) {
    e.stopPropagation();
  }
  /**
   * Handles key press
   */
  handleKeypress(e) {
    if (/[e,. ]/.test(String.fromCharCode(e.keyCode))) {
      e.preventDefault();
    }
  }
  /**
   * Handle key up
   */
  handleKeyUp(e) {
    if (e.altKey || e.ctrlKey) {
      return;
    }
    const target = e.target;
    let value = target.value;
    value = value.replace(/[e,.\s]/g, "");
    if (value.length >= 1) {
      const subvalue = value.substr(1);
      value = value[0] + subvalue.replace(/[+-]/g, "");
    }
    if (target.value !== value) {
      e.preventDefault();
      target.value = value;
    }
  }
  /**
   * Call the submit handler if continuous update is true and we are not
   * obviously incomplete.
   */
  handleChanging(e) {
    const target = e.target;
    const trimmed = target.value.trim();
    if (trimmed === "" || ["-", "-.", ".", "+.", "+"].indexOf(trimmed) >= 0) {
      return;
    }
    if (this.model.get("continuous_update")) {
      this.handleChanged(e);
    }
  }
  /**
   * Applies validated input.
   */
  handleChanged(e) {
    const target = e.target;
    let numericalValue = this._parse_value(target.value);
    if (isNaN(numericalValue)) {
      target.value = this.model.get("value");
    } else {
      let boundedValue = numericalValue;
      if (this.model.get("max") !== void 0) {
        boundedValue = Math.min(this.model.get("max"), boundedValue);
      }
      if (this.model.get("min") !== void 0) {
        boundedValue = Math.max(this.model.get("min"), boundedValue);
      }
      if (boundedValue !== numericalValue) {
        target.value = boundedValue;
        numericalValue = boundedValue;
      }
      if (numericalValue !== this.model.get("value")) {
        this.model.set("value", numericalValue, { updated_view: this });
        this.touch();
      }
    }
  }
};
var ProgressStyleModel = class extends DescriptionStyleModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "ProgressStyleModel" });
  }
};
ProgressStyleModel.styleProperties = Object.assign(Object.assign({}, DescriptionStyleModel.styleProperties), { bar_color: {
  selector: ".progress-bar",
  attribute: "background-color",
  default: null
} });
var IntProgressModel = class extends BoundedIntModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "IntProgressModel", _view_name: "ProgressView", orientation: "horizontal", bar_style: "", style: null });
  }
};
var ProgressView = class _ProgressView extends DescriptionView {
  initialize(parameters) {
    super.initialize(parameters);
    this.listenTo(this.model, "change:bar_style", this.update_bar_style);
    this.luminoWidget.addClass("jupyter-widgets");
  }
  render() {
    super.render();
    const orientation = this.model.get("orientation");
    const className = orientation === "horizontal" ? "widget-hprogress" : "widget-vprogress";
    this.el.classList.add(className);
    this.progress = document.createElement("div");
    this.progress.classList.add("progress");
    this.progress.style.position = "relative";
    this.el.appendChild(this.progress);
    this.bar = document.createElement("div");
    this.bar.classList.add("progress-bar");
    this.bar.style.position = "absolute";
    this.bar.style.bottom = "0px";
    this.bar.style.left = "0px";
    this.progress.appendChild(this.bar);
    this.update();
    this.set_bar_style();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed.  The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update() {
    const value = this.model.get("value");
    const max2 = this.model.get("max");
    const min = this.model.get("min");
    const orientation = this.model.get("orientation");
    const percent = 100 * (value - min) / (max2 - min);
    if (orientation === "horizontal") {
      this.el.classList.remove("widget-inline-vbox");
      this.el.classList.remove("widget-vprogress");
      this.el.classList.add("widget-inline-hbox");
      this.el.classList.add("widget-hprogress");
      this.bar.style.width = percent + "%";
      this.bar.style.height = "100%";
    } else {
      this.el.classList.remove("widget-inline-hbox");
      this.el.classList.remove("widget-hprogress");
      this.el.classList.add("widget-inline-vbox");
      this.el.classList.add("widget-vprogress");
      this.bar.style.width = "100%";
      this.bar.style.height = percent + "%";
    }
    return super.update();
  }
  update_bar_style() {
    this.update_mapped_classes(_ProgressView.class_map, "bar_style", this.bar);
  }
  set_bar_style() {
    this.set_mapped_classes(_ProgressView.class_map, "bar_style", this.bar);
  }
};
ProgressView.class_map = {
  success: ["progress-bar-success"],
  info: ["progress-bar-info"],
  warning: ["progress-bar-warning"],
  danger: ["progress-bar-danger"]
};
var PlayModel = class extends BoundedIntModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "PlayModel", _view_name: "PlayView", repeat: false, playing: false, show_repeat: true, interval: 100, step: 1, disabled: false });
  }
  initialize(attributes, options) {
    super.initialize(attributes, options);
  }
  loop() {
    if (!this.get("playing")) {
      return;
    }
    const next_value = this.get("value") + this.get("step");
    if (next_value <= this.get("max")) {
      this.set("value", next_value);
      this.schedule_next();
    } else {
      if (this.get("repeat")) {
        this.set("value", this.get("min"));
        this.schedule_next();
      } else {
        this.pause();
      }
    }
    this.save_changes();
  }
  schedule_next() {
    this._timerId = window.setTimeout(this.loop.bind(this), this.get("interval"));
  }
  stop() {
    this.pause();
    this.set("value", this.get("min"));
    this.save_changes();
  }
  pause() {
    window.clearTimeout(this._timerId);
    this._timerId = void 0;
    this.set("playing", false);
    this.save_changes();
  }
  animate() {
    if (this._timerId !== void 0) {
      return;
    }
    if (this.get("value") === this.get("max")) {
      this.set("value", this.get("min"));
      this.schedule_next();
      this.save_changes();
    } else {
      this.loop();
    }
    this.save_changes();
  }
  play() {
    this.set("playing", !this.get("playing"));
    this.save_changes();
  }
  repeat() {
    this.set("repeat", !this.get("repeat"));
    this.save_changes();
  }
};
var PlayView = class extends DOMWidgetView {
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-inline-hbox");
    this.el.classList.add("widget-play");
    this.playPauseButton = document.createElement("button");
    this.stopButton = document.createElement("button");
    this.repeatButton = document.createElement("button");
    this.playPauseButton.className = "jupyter-button";
    this.stopButton.className = "jupyter-button";
    this.repeatButton.className = "jupyter-button";
    this.el.appendChild(this.playPauseButton);
    this.el.appendChild(this.stopButton);
    this.el.appendChild(this.repeatButton);
    const playIcon = document.createElement("i");
    playIcon.className = "fa fa-play";
    this.playPauseButton.appendChild(playIcon);
    const stopIcon = document.createElement("i");
    stopIcon.className = "fa fa-stop";
    this.stopButton.appendChild(stopIcon);
    const repeatIcon = document.createElement("i");
    repeatIcon.className = "fa fa-retweet";
    this.repeatButton.appendChild(repeatIcon);
    this.playPauseButton.onclick = this.model.play.bind(this.model);
    this.stopButton.onclick = this.model.stop.bind(this.model);
    this.repeatButton.onclick = this.model.repeat.bind(this.model);
    this.listenTo(this.model, "change:playing", this.onPlayingChanged);
    this.listenTo(this.model, "change:repeat", this.updateRepeat);
    this.listenTo(this.model, "change:show_repeat", this.updateRepeat);
    this.updatePlaying();
    this.updateRepeat();
    this.update();
  }
  update() {
    const disabled = this.model.get("disabled");
    this.playPauseButton.disabled = disabled;
    this.stopButton.disabled = disabled;
    this.repeatButton.disabled = disabled;
    this.updatePlaying();
  }
  onPlayingChanged() {
    this.updatePlaying();
    const previous = this.model.previous("playing");
    const current = this.model.get("playing");
    if (!previous && current) {
      this.model.animate();
    } else {
      this.model.pause();
    }
  }
  updatePlaying() {
    const playing = this.model.get("playing");
    const icon = this.playPauseButton.getElementsByTagName("i")[0];
    if (playing) {
      icon.className = "fa fa-pause";
    } else {
      icon.className = "fa fa-play";
    }
  }
  updateRepeat() {
    const repeat = this.model.get("repeat");
    this.repeatButton.style.display = this.model.get("show_repeat") ? this.playPauseButton.style.display : "none";
    if (repeat) {
      this.repeatButton.classList.add("mod-active");
    } else {
      this.repeatButton.classList.remove("mod-active");
    }
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_float.js
var import_d3_format2 = require("d3-format");
var import_nouislider2 = __toESM(require("nouislider"));
var FloatModel = class extends CoreDescriptionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "FloatModel", value: 0 });
  }
};
var BoundedFloatModel = class extends FloatModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "BoundedFloatModel", max: 100, min: 0 });
  }
};
var FloatSliderModel = class extends BoundedFloatModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "FloatSliderModel", _view_name: "FloatSliderView", step: 1, orientation: "horizontal", _range: false, readout: true, readout_format: ".2f", slider_color: null, continuous_update: true, disabled: false });
  }
  initialize(attributes, options) {
    super.initialize(attributes, options);
    this.on("change:readout_format", this.update_readout_format, this);
    this.update_readout_format();
  }
  update_readout_format() {
    this.readout_formatter = (0, import_d3_format2.format)(this.get("readout_format"));
  }
};
var FloatLogSliderModel = class extends BoundedFloatModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "FloatLogSliderModel", _view_name: "FloatLogSliderView", step: 0.1, orientation: "horizontal", _range: false, readout: true, readout_format: ".3g", slider_color: null, continuous_update: true, disabled: false, base: 10, value: 1, min: 0, max: 4 });
  }
  initialize(attributes, options) {
    super.initialize(attributes, options);
    this.on("change:readout_format", this.update_readout_format, this);
    this.update_readout_format();
  }
  update_readout_format() {
    this.readout_formatter = (0, import_d3_format2.format)(this.get("readout_format"));
  }
};
var FloatRangeSliderModel = class extends FloatSliderModel {
};
var FloatSliderView = class extends IntSliderView {
  constructor() {
    super(...arguments);
    this._parse_value = parseFloat;
  }
  /**
   * Validate the value of the slider before sending it to the back-end
   * and applying it to the other views on the page.
   */
  _validate_slide_value(x) {
    return x;
  }
};
var FloatLogSliderView = class extends BaseIntSliderView {
  constructor() {
    super(...arguments);
    this._parse_value = parseFloat;
  }
  update(options) {
    super.update(options);
    const value = this.model.get("value");
    this.readout.textContent = this.valueToString(value);
  }
  /**
   * Convert from value to exponent
   *
   * @param value the widget value
   * @returns the log-value between the min/max exponents
   */
  logCalc(value) {
    const min = this.model.get("min");
    const max2 = this.model.get("max");
    const base = this.model.get("base");
    let log_value = Math.log(value) / Math.log(base);
    if (log_value > max2) {
      log_value = max2;
    } else if (log_value < min) {
      log_value = min;
    }
    return log_value;
  }
  createSlider() {
    var _a;
    const orientation = this.model.get("orientation");
    const behavior = this.model.get("behavior");
    import_nouislider2.default.create(this.$slider, {
      start: this.logCalc(this.model.get("value")),
      behaviour: behavior,
      range: {
        min: this.model.get("min"),
        max: this.model.get("max")
      },
      step: (_a = this.model.get("step")) !== null && _a !== void 0 ? _a : void 0,
      animate: false,
      orientation,
      direction: orientation === "horizontal" ? "ltr" : "rtl",
      format: {
        from: (value) => Number(value),
        to: (value) => value
      }
    });
    this.$slider.noUiSlider.on("update", (values, handle) => {
      this.handleSliderUpdateEvent(values, handle);
    });
    this.$slider.noUiSlider.on("change", (values, handle) => {
      this.handleSliderChangeEvent(values, handle);
    });
  }
  /**
   * Write value to a string
   */
  valueToString(value) {
    const format4 = this.model.readout_formatter;
    return format4(value);
  }
  /**
   * Parse value from a string
   */
  stringToValue(text) {
    return text === null ? NaN : this._parse_value(text);
  }
  /**
   * this handles the entry of text into the contentEditable label first, the
   * value is checked if it contains a parseable value then it is clamped
   * within the min-max range of the slider finally, the model is updated if
   * the value is to be changed
   *
   * if any of these conditions are not met, the text is reset
   */
  handleTextChange() {
    let value = this.stringToValue(this.readout.textContent);
    const vmin = this.model.get("min");
    const vmax = this.model.get("max");
    const base = this.model.get("base");
    if (isNaN(value)) {
      this.readout.textContent = this.valueToString(this.model.get("value"));
    } else {
      value = Math.max(Math.min(value, Math.pow(base, vmax)), Math.pow(base, vmin));
      if (value !== this.model.get("value")) {
        this.readout.textContent = this.valueToString(value);
        this.model.set("value", value);
        this.touch();
      } else {
        this.readout.textContent = this.valueToString(this.model.get("value"));
      }
    }
  }
  /**
   * Called whilst the slider is dragged, tapped or moved by the arrow keys.
   */
  handleSliderUpdateEvent(values, handle) {
    const base = this.model.get("base");
    const actual_value = Math.pow(base, this._validate_slide_value(values[0]));
    this.readout.textContent = this.valueToString(actual_value);
    if (this.model.get("continuous_update")) {
      this.handleSliderChanged(values, handle);
    }
  }
  /**
   * Called when the slider handle is released after dragging,
   * or by tapping or moving by the arrow keys.
   */
  handleSliderChangeEvent(values, handle) {
    const base = this.model.get("base");
    const actual_value = Math.pow(base, this._validate_slide_value(values[0]));
    this.readout.textContent = this.valueToString(actual_value);
    this.handleSliderChanged(values, handle);
  }
  /**
   * Called when the slider value has changed.
   *
   * Calling model.set will trigger all of the other views of the
   * model to update.
   */
  handleSliderChanged(values, handle) {
    if (this._updating_slider) {
      return;
    }
    const base = this.model.get("base");
    const actual_value = Math.pow(base, this._validate_slide_value(values[0]));
    this.model.set("value", actual_value, { updated_view: this });
    this.touch();
  }
  updateSliderValue(model, value, options) {
    if (options.updated_view === this) {
      return;
    }
    const log_value = this.logCalc(this.model.get("value"));
    this.$slider.noUiSlider.set(log_value);
  }
  updateSliderOptions(e) {
    this.$slider.noUiSlider.updateOptions({
      start: this.logCalc(this.model.get("value")),
      range: {
        min: this.model.get("min"),
        max: this.model.get("max")
      },
      step: this.model.get("step")
    });
  }
  _validate_slide_value(x) {
    return x;
  }
};
var FloatRangeSliderView = class extends IntRangeSliderView {
  constructor() {
    super(...arguments);
    this._parse_value = parseFloat;
    this._range_regex = /^\s*([+-]?(?:\d*\.?\d+|\d+\.)(?:[eE][-:]?\d+)?)\s*[-:–]\s*([+-]?(?:\d*\.?\d+|\d+\.)(?:[eE][+-]?\d+)?)/;
  }
  /**
   * Validate the value of the slider before sending it to the back-end
   * and applying it to the other views on the page.
   */
  _validate_slide_value(x) {
    return x;
  }
};
var FloatTextModel = class extends FloatModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "FloatTextModel", _view_name: "FloatTextView", disabled: false, continuous_update: false });
  }
};
var BoundedFloatTextModel = class extends BoundedFloatModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "BoundedFloatTextModel", _view_name: "FloatTextView", disabled: false, continuous_update: false, step: 0.1 });
  }
};
var FloatTextView = class extends IntTextView {
  constructor() {
    super(...arguments);
    this._parse_value = parseFloat;
    this._default_step = "any";
  }
  /**
   * Handle key press
   */
  handleKeypress(e) {
    e.stopPropagation();
  }
  /**
   * Handle key up
   */
  handleKeyUp(e) {
  }
};
var FloatProgressModel = class extends BoundedFloatModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "FloatProgressModel", _view_name: "ProgressView", orientation: "horizontal", bar_style: "", style: null });
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_controller.js
var import_algorithm4 = require("@lumino/algorithm");
var import_jquery3 = __toESM(require("jquery"));
var ControllerButtonModel = class extends CoreDOMWidgetModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "ControllerButtonModel", _view_name: "ControllerButtonView", value: 0, pressed: false });
  }
};
var ControllerButtonView = class extends DOMWidgetView {
  render() {
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-controller-button");
    this.el.style.width = "fit-content";
    this.support = document.createElement("div");
    this.support.style.position = "relative";
    this.support.style.margin = "1px";
    this.support.style.width = "16px";
    this.support.style.height = "16px";
    this.support.style.border = "1px solid black";
    this.support.style.background = "lightgray";
    this.el.appendChild(this.support);
    this.bar = document.createElement("div");
    this.bar.style.position = "absolute";
    this.bar.style.width = "100%";
    this.bar.style.bottom = "0px";
    this.bar.style.background = "gray";
    this.support.appendChild(this.bar);
    this.update();
    this.label = document.createElement("div");
    this.label.textContent = this.model.get("description");
    this.label.style.textAlign = "center";
    this.el.appendChild(this.label);
  }
  update() {
    this.bar.style.height = 100 * this.model.get("value") + "%";
  }
};
var ControllerAxisModel = class extends CoreDOMWidgetModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "ControllerAxisModel", _view_name: "ControllerAxisView", value: 0 });
  }
};
var ControllerAxisView = class extends DOMWidgetView {
  render() {
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-controller-axis");
    this.el.style.width = "16px";
    this.el.style.padding = "4px";
    this.support = document.createElement("div");
    this.support.style.position = "relative";
    this.support.style.margin = "1px";
    this.support.style.width = "4px";
    this.support.style.height = "64px";
    this.support.style.border = "1px solid black";
    this.support.style.background = "lightgray";
    this.bullet = document.createElement("div");
    this.bullet.style.position = "absolute";
    this.bullet.style.margin = "-3px";
    this.bullet.style.boxSizing = "unset";
    this.bullet.style.width = "10px";
    this.bullet.style.height = "10px";
    this.bullet.style.background = "gray";
    this.label = document.createElement("div");
    this.label.textContent = this.model.get("description");
    this.label.style.textAlign = "center";
    this.support.appendChild(this.bullet);
    this.el.appendChild(this.support);
    this.el.appendChild(this.label);
    this.update();
  }
  update() {
    this.bullet.style.top = 50 * (this.model.get("value") + 1) + "%";
  }
};
var ControllerModel = class extends CoreDOMWidgetModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "ControllerModel", _view_name: "ControllerView", index: 0, name: "", mapping: "", connected: false, timestamp: 0, buttons: [], axes: [] });
  }
  initialize(attributes, options) {
    super.initialize(attributes, options);
    if (navigator.getGamepads === void 0) {
      this.readout = "This browser does not support gamepads.";
      console.error(this.readout);
    } else {
      this.readout = "Connect gamepad and press any button.";
      if (this.get("connected")) {
        this.update_loop();
      } else {
        this.wait_loop();
      }
    }
  }
  /**
   * Waits for a gamepad to be connected at the provided index.
   * Once one is connected, it will start the update loop, which
   * populates the update of axes and button values.
   */
  wait_loop() {
    const index = this.get("index");
    const pad = navigator.getGamepads()[index];
    if (pad) {
      this.setup(pad).then((controls) => {
        this.set(controls);
        this.save_changes();
        window.requestAnimationFrame(this.update_loop.bind(this));
      });
    } else {
      window.requestAnimationFrame(this.wait_loop.bind(this));
    }
  }
  /**
   * Given a native gamepad object, returns a promise for a dictionary of
   * controls, of the form
   * {
   *     buttons: list of Button models,
   *     axes: list of Axis models,
   * }
   */
  setup(pad) {
    this.set({
      name: pad.id,
      mapping: pad.mapping,
      connected: pad.connected,
      timestamp: pad.timestamp
    });
    return resolvePromisesDict({
      buttons: Promise.all(pad.buttons.map((btn, index) => {
        return this._create_button_model(index);
      })),
      axes: Promise.all(pad.axes.map((axis, index) => {
        return this._create_axis_model(index);
      }))
    });
  }
  /**
   * Update axes and buttons values, until the gamepad is disconnected.
   * When the gamepad is disconnected, this.reset_gamepad is called.
   */
  update_loop() {
    const index = this.get("index");
    const id = this.get("name");
    const pad = navigator.getGamepads()[index];
    if (pad && index === pad.index && id === pad.id) {
      this.set({
        timestamp: pad.timestamp,
        connected: pad.connected
      });
      this.save_changes();
      this.get("buttons").forEach(function(model, index2) {
        model.set({
          value: pad.buttons[index2].value,
          pressed: pad.buttons[index2].pressed
        });
        model.save_changes();
      });
      this.get("axes").forEach(function(model, index2) {
        model.set("value", pad.axes[index2]);
        model.save_changes();
      });
      window.requestAnimationFrame(this.update_loop.bind(this));
    } else {
      this.reset_gamepad();
    }
  }
  /**
   * Resets the gamepad attributes, and start the wait_loop.
   */
  reset_gamepad() {
    this.get("buttons").forEach(function(button) {
      button.close();
    });
    this.get("axes").forEach(function(axis) {
      axis.close();
    });
    this.set({
      name: "",
      mapping: "",
      connected: false,
      timestamp: 0,
      buttons: [],
      axes: []
    });
    this.save_changes();
    window.requestAnimationFrame(this.wait_loop.bind(this));
  }
  /**
   * Creates a gamepad button widget.
   */
  _create_button_model(index) {
    return this.widget_manager.new_widget({
      model_name: "ControllerButtonModel",
      model_module: "@jupyter-widgets/controls",
      model_module_version: this.get("_model_module_version"),
      view_name: "ControllerButtonView",
      view_module: "@jupyter-widgets/controls",
      view_module_version: this.get("_view_module_version")
    }).then(function(model) {
      model.set("description", index);
      return model;
    });
  }
  /**
   * Creates a gamepad axis widget.
   */
  _create_axis_model(index) {
    return this.widget_manager.new_widget({
      model_name: "ControllerAxisModel",
      model_module: "@jupyter-widgets/controls",
      model_module_version: this.get("_model_module_version"),
      view_name: "ControllerAxisView",
      view_module: "@jupyter-widgets/controls",
      view_module_version: this.get("_view_module_version")
    }).then(function(model) {
      model.set("description", index);
      return model;
    });
  }
};
ControllerModel.serializers = Object.assign(Object.assign({}, CoreDOMWidgetModel.serializers), { buttons: { deserialize: unpack_models }, axes: { deserialize: unpack_models } });
var ControllerView = class extends DOMWidgetView {
  _createElement(tagName) {
    this.luminoWidget = new JupyterLuminoPanelWidget({ view: this });
    return this.luminoWidget.node;
  }
  _setElement(el) {
    if (this.el || el !== this.luminoWidget.node) {
      throw new Error("Cannot reset the DOM element.");
    }
    this.el = this.luminoWidget.node;
    this.$el = (0, import_jquery3.default)(this.luminoWidget.node);
  }
  initialize(parameters) {
    super.initialize(parameters);
    this.button_views = new ViewList(this.add_button, null, this);
    this.listenTo(this.model, "change:buttons", (model, value) => {
      this.button_views.update(value);
    });
    this.axis_views = new ViewList(this.add_axis, null, this);
    this.listenTo(this.model, "change:axes", (model, value) => {
      this.axis_views.update(value);
    });
    this.listenTo(this.model, "change:name", this.update_label);
  }
  render() {
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-controller");
    this.label = document.createElement("div");
    this.el.appendChild(this.label);
    this.axis_box = new Panel();
    this.axis_box.node.style.display = "flex";
    this.luminoWidget.addWidget(this.axis_box);
    this.button_box = new Panel();
    this.button_box.node.style.display = "flex";
    this.luminoWidget.addWidget(this.button_box);
    this.button_views.update(this.model.get("buttons"));
    this.axis_views.update(this.model.get("axes"));
    this.update_label();
  }
  update_label() {
    this.label.textContent = this.model.get("name") || this.model.readout;
  }
  add_button(model) {
    const dummy = new Widget();
    this.button_box.addWidget(dummy);
    return this.create_child_view(model).then((view) => {
      const i = import_algorithm4.ArrayExt.firstIndexOf(this.button_box.widgets, dummy);
      this.button_box.insertWidget(i, view.luminoWidget);
      dummy.dispose();
      return view;
    }).catch(reject("Could not add child button view to controller", true));
  }
  add_axis(model) {
    const dummy = new Widget();
    this.axis_box.addWidget(dummy);
    return this.create_child_view(model).then((view) => {
      const i = import_algorithm4.ArrayExt.firstIndexOf(this.axis_box.widgets, dummy);
      this.axis_box.insertWidget(i, view.luminoWidget);
      dummy.dispose();
      return view;
    }).catch(reject("Could not add child axis view to controller", true));
  }
  remove() {
    super.remove();
    this.button_views.remove();
    this.axis_views.remove();
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_selection.js
var import_nouislider3 = __toESM(require("nouislider"));
var SelectionModel = class extends CoreDescriptionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "SelectionModel", index: "", _options_labels: [], disabled: false });
  }
};
var SelectionView = class extends DescriptionView {
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-inline-hbox");
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed.  The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update() {
    super.update();
    if (this.listbox) {
      this.listbox.disabled = this.model.get("disabled");
    }
    this.updateTabindex();
    this.updateTooltip();
  }
  updateTabindex() {
    if (!this.listbox) {
      return;
    }
    const tabbable = this.model.get("tabbable");
    if (tabbable === true) {
      this.listbox.setAttribute("tabIndex", "0");
    } else if (tabbable === false) {
      this.listbox.setAttribute("tabIndex", "-1");
    } else if (tabbable === null) {
      this.listbox.removeAttribute("tabIndex");
    }
  }
  updateTooltip() {
    if (!this.listbox)
      return;
    const title = this.model.get("tooltip");
    if (!title) {
      this.listbox.removeAttribute("title");
    } else if (this.model.get("description").length === 0) {
      this.listbox.setAttribute("title", title);
    }
  }
};
var DropdownModel = class extends SelectionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "DropdownModel", _view_name: "DropdownView", button_style: "" });
  }
};
var DropdownView = class extends SelectionView {
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("widget-dropdown");
    this.listbox = document.createElement("select");
    this.listbox.id = this.label.htmlFor = uuid();
    this.el.appendChild(this.listbox);
    this._updateOptions();
    this.update();
  }
  /**
   * Update the contents of this view
   */
  update(options) {
    if ((options === null || options === void 0 ? void 0 : options.updated_view) !== this) {
      const optsChanged = this.model.hasChanged("_options_labels");
      if (optsChanged) {
        this._updateOptions();
      }
    }
    const index = this.model.get("index");
    this.listbox.selectedIndex = index === null ? -1 : index;
    return super.update();
  }
  _updateOptions() {
    this.listbox.textContent = "";
    const items = this.model.get("_options_labels");
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const option = document.createElement("option");
      option.textContent = item.replace(/ /g, "\xA0");
      option.setAttribute("data-value", encodeURIComponent(item));
      option.value = item;
      this.listbox.appendChild(option);
    }
  }
  events() {
    return {
      "change select": "_handle_change"
    };
  }
  /**
   * Handle when a new value is selected.
   */
  _handle_change() {
    this.model.set("index", this.listbox.selectedIndex === -1 ? null : this.listbox.selectedIndex, { updated_view: this });
    this.touch();
  }
  /**
   * Handle message sent to the front end.
   */
  handle_message(content) {
    if (content.do === "focus") {
      this.listbox.focus();
    } else if (content.do === "blur") {
      this.listbox.blur();
    }
  }
};
var SelectModel = class extends SelectionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "SelectModel", _view_name: "SelectView", rows: 5 });
  }
};
var SelectView = class extends SelectionView {
  /**
   * Public constructor.
   */
  initialize(parameters) {
    super.initialize(parameters);
    this.listbox = document.createElement("select");
  }
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("widget-select");
    this.listbox.id = this.label.htmlFor = uuid();
    this.el.appendChild(this.listbox);
    this._updateOptions();
    this.update();
    this.updateSelection();
  }
  /**
   * Update the contents of this view
   */
  update(options) {
    if ((options === null || options === void 0 ? void 0 : options.updated_view) !== this) {
      const optsChange = this.model.hasChanged("_options_labels");
      const idxChange = this.model.hasChanged("index");
      if (optsChange || idxChange) {
        const idx = this.model.get("index");
        if (optsChange) {
          this._updateOptions();
        }
        this.updateSelection(idx);
      }
    }
    super.update();
    let rows = this.model.get("rows");
    if (rows === null) {
      rows = "";
    }
    this.listbox.setAttribute("size", rows);
  }
  updateSelection(index) {
    index = index || this.model.get("index");
    this.listbox.selectedIndex = index === null ? -1 : index;
  }
  _updateOptions() {
    this.listbox.textContent = "";
    const items = this.model.get("_options_labels");
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const option = document.createElement("option");
      option.textContent = item.replace(/ /g, "\xA0");
      option.setAttribute("data-value", encodeURIComponent(item));
      option.value = item;
      this.listbox.appendChild(option);
    }
  }
  events() {
    return {
      "change select": "_handle_change"
    };
  }
  /**
   * Handle when a new value is selected.
   */
  _handle_change() {
    this.model.set("index", this.listbox.selectedIndex, { updated_view: this });
    this.touch();
  }
  /**
   * Handle message sent to the front end.
   */
  handle_message(content) {
    if (content.do == "focus") {
      this.listbox.focus();
    } else if (content.do == "blur") {
      this.listbox.blur();
    }
  }
};
var RadioButtonsModel = class extends SelectionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "RadioButtonsModel", _view_name: "RadioButtonsView", tooltips: [], icons: [], button_style: "", orientation: "vertical" });
  }
};
var RadioButtonsView = class extends DescriptionView {
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("widget-radio");
    this.container = document.createElement("div");
    this.el.appendChild(this.container);
    this.container.classList.add("widget-radio-box");
    this.update();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed.  The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update(options) {
    if (this.model.get("orientation") === "vertical") {
      this.container.classList.remove("widget-radio-box-horizontal");
      this.container.classList.add("widget-radio-box-vertical");
    } else {
      this.container.classList.remove("widget-radio-box-vertical");
      this.container.classList.add("widget-radio-box-horizontal");
    }
    const items = this.model.get("_options_labels");
    const radios = Array.from(this.container.querySelectorAll('input[type="radio"]')).map((x) => x.value);
    let stale = items.length !== radios.length;
    if (!stale) {
      for (let i = 0, len = items.length; i < len; ++i) {
        if (radios[i] !== items[i]) {
          stale = true;
          break;
        }
      }
    }
    if (stale && (options === void 0 || options.updated_view !== this)) {
      this.container.textContent = "";
      items.forEach((item, index) => {
        const label = document.createElement("label");
        label.textContent = item;
        this.container.appendChild(label);
        const radio = document.createElement("input");
        radio.setAttribute("type", "radio");
        radio.value = index.toString();
        radio.setAttribute("data-value", encodeURIComponent(item));
        label.appendChild(radio);
      });
    }
    items.forEach((item, index) => {
      const item_query = 'input[data-value="' + encodeURIComponent(item) + '"]';
      const radio = this.container.querySelectorAll(item_query);
      if (radio.length > 0) {
        const radio_el = radio[0];
        radio_el.checked = this.model.get("index") === index;
        radio_el.disabled = this.model.get("disabled");
      }
    });
    setTimeout(this.adjustPadding, 0, this);
    return super.update(options);
  }
  /**
   * Adjust Padding to Multiple of Line Height
   *
   * Adjust margins so that the overall height
   * is a multiple of a single line height.
   *
   * This widget needs it because radio options
   * are spaced tighter than individual widgets
   * yet we would like the full widget line up properly
   * when displayed side-by-side with other widgets.
   */
  adjustPadding(e) {
    const elStyles = window.getComputedStyle(e.el);
    const margins = parseInt(elStyles.marginTop, 10) + parseInt(elStyles.marginBottom, 10);
    const lineHeight = e.label.offsetHeight + margins;
    const cStyles = window.getComputedStyle(e.container);
    const containerMargin = parseInt(cStyles.marginBottom, 10);
    const diff = (e.el.offsetHeight + margins - containerMargin) % lineHeight;
    const extraMargin = diff === 0 ? 0 : lineHeight - diff;
    e.container.style.marginBottom = extraMargin + "px";
  }
  events() {
    return {
      'click input[type="radio"]': "_handle_click"
    };
  }
  /**
   * Handle when a value is clicked.
   *
   * Calling model.set will trigger all of the other views of the
   * model to update.
   */
  _handle_click(event) {
    const target = event.target;
    this.model.set("index", parseInt(target.value, 10), { updated_view: this });
    this.touch();
  }
  /**
   * Handle message sent to the front end.
   */
  handle_message(content) {
    if (content.do == "focus") {
      const firstItem = this.container.firstElementChild;
      firstItem.focus();
    } else if (content.do == "blur") {
      for (let i = 0; i < this.container.children.length; i++) {
        const item = this.container.children[i];
        item.blur();
      }
    }
  }
};
var ToggleButtonsStyleModel = class extends DescriptionStyleModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "ToggleButtonsStyleModel" });
  }
};
ToggleButtonsStyleModel.styleProperties = Object.assign(Object.assign({}, DescriptionStyleModel.styleProperties), { button_width: {
  selector: ".widget-toggle-button",
  attribute: "width",
  default: null
}, font_weight: {
  selector: ".widget-toggle-button",
  attribute: "font-weight",
  default: ""
} });
var ToggleButtonsModel = class extends SelectionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "ToggleButtonsModel", _view_name: "ToggleButtonsView" });
  }
};
var ToggleButtonsView = class _ToggleButtonsView extends DescriptionView {
  initialize(options) {
    this._css_state = {};
    super.initialize(options);
    this.listenTo(this.model, "change:button_style", this.update_button_style);
  }
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("widget-toggle-buttons");
    this.buttongroup = document.createElement("div");
    this.el.appendChild(this.buttongroup);
    this.update();
    this.set_button_style();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed.  The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update(options) {
    const items = this.model.get("_options_labels");
    const icons = this.model.get("icons") || [];
    const previous_icons = this.model.previous("icons") || [];
    const previous_bstyle = _ToggleButtonsView.classMap[this.model.previous("button_style")] || "";
    const tooltips = this.model.get("tooltips") || [];
    const disabled = this.model.get("disabled");
    const buttons = this.buttongroup.querySelectorAll("button");
    const values = Array.from(buttons).map((x) => x.value);
    let stale = false;
    for (let i = 0, len = items.length; i < len; ++i) {
      if (values[i] !== items[i] || icons[i] !== previous_icons[i]) {
        stale = true;
        break;
      }
    }
    if (stale && (options === void 0 || options.updated_view !== this)) {
      this.buttongroup.textContent = "";
      items.forEach((item, index) => {
        let item_html;
        const empty2 = item.trim().length === 0 && (!icons[index] || icons[index].trim().length === 0);
        if (empty2) {
          item_html = "&nbsp;";
        } else {
          item_html = escape_html(item);
        }
        const icon = document.createElement("i");
        const button = document.createElement("button");
        if (icons[index]) {
          icon.className = "fa fa-" + icons[index];
        }
        button.setAttribute("type", "button");
        button.className = "widget-toggle-button jupyter-button";
        if (previous_bstyle) {
          button.classList.add(previous_bstyle);
        }
        button.innerHTML = item_html;
        button.setAttribute("data-value", encodeURIComponent(item));
        button.setAttribute("value", index.toString());
        button.appendChild(icon);
        button.disabled = disabled;
        if (tooltips[index]) {
          button.setAttribute("title", tooltips[index]);
        }
        this.update_style_traits(button);
        this.buttongroup.appendChild(button);
      });
    }
    items.forEach((item, index) => {
      const item_query = '[data-value="' + encodeURIComponent(item) + '"]';
      const button = this.buttongroup.querySelector(item_query);
      if (this.model.get("index") === index) {
        button.classList.add("mod-active");
      } else {
        button.classList.remove("mod-active");
      }
    });
    this.stylePromise.then(function(style) {
      if (style) {
        style.style();
      }
    });
    return super.update(options);
  }
  update_style_traits(button) {
    for (const name in this._css_state) {
      if (Object.prototype.hasOwnProperty.call(this._css_state, "name")) {
        if (name === "margin") {
          this.buttongroup.style[name] = this._css_state[name];
        } else if (name !== "width") {
          if (button) {
            button.style[name] = this._css_state[name];
          } else {
            const buttons = this.buttongroup.querySelectorAll("button");
            if (buttons.length) {
              buttons[0].style[name] = this._css_state[name];
            }
          }
        }
      }
    }
  }
  update_button_style() {
    const buttons = this.buttongroup.querySelectorAll("button");
    for (let i = 0; i < buttons.length; i++) {
      this.update_mapped_classes(_ToggleButtonsView.classMap, "button_style", buttons[i]);
    }
  }
  set_button_style() {
    const buttons = this.buttongroup.querySelectorAll("button");
    for (let i = 0; i < buttons.length; i++) {
      this.set_mapped_classes(_ToggleButtonsView.classMap, "button_style", buttons[i]);
    }
  }
  events() {
    return {
      "click button": "_handle_click"
    };
  }
  /**
   * Handle when a value is clicked.
   *
   * Calling model.set will trigger all of the other views of the
   * model to update.
   */
  _handle_click(event) {
    const target = event.target;
    this.model.set("index", parseInt(target.value, 10), { updated_view: this });
    this.touch();
    this.send({ event: "click" });
  }
};
(function(ToggleButtonsView2) {
  ToggleButtonsView2.classMap = {
    primary: ["mod-primary"],
    success: ["mod-success"],
    info: ["mod-info"],
    warning: ["mod-warning"],
    danger: ["mod-danger"]
  };
})(ToggleButtonsView || (ToggleButtonsView = {}));
var SelectionSliderModel = class extends SelectionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "SelectionSliderModel", _view_name: "SelectionSliderView", orientation: "horizontal", readout: true, continuous_update: true });
  }
};
var SelectionSliderView = class extends DescriptionView {
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("widget-hslider");
    this.el.classList.add("widget-slider");
    this.$slider = document.createElement("div");
    this.$slider.classList.add("slider");
    this.slider_container = document.createElement("div");
    this.slider_container.classList.add("slider-container");
    this.slider_container.appendChild(this.$slider);
    this.el.appendChild(this.slider_container);
    this.readout = document.createElement("div");
    this.el.appendChild(this.readout);
    this.readout.classList.add("widget-readout");
    this.readout.style.display = "none";
    this.createSlider();
    this.model.on("change:orientation", this.regenSlider, this);
    this.model.on("change:index", this.updateSliderValue, this);
    this.update();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed.  The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update(options) {
    if ((options === null || options === void 0 ? void 0 : options.updated_view) !== this) {
      this.updateSliderOptions(this.model);
      const orientation = this.model.get("orientation");
      const disabled = this.model.get("disabled");
      if (disabled) {
        this.readout.contentEditable = "false";
        this.$slider.setAttribute("disabled", true);
      } else {
        this.readout.contentEditable = "true";
        this.$slider.removeAttribute("disabled");
      }
      if (orientation === "vertical") {
        this.el.classList.remove("widget-hslider");
        this.el.classList.remove("widget-inline-hbox");
        this.el.classList.add("widget-vslider");
        this.el.classList.add("widget-inline-vbox");
      } else {
        this.el.classList.remove("widget-vslider");
        this.el.classList.remove("widget-inline-vbox");
        this.el.classList.add("widget-hslider");
        this.el.classList.add("widget-inline-hbox");
      }
      const readout = this.model.get("readout");
      if (readout) {
        this.readout.style.display = "";
      } else {
        this.readout.style.display = "none";
      }
      this.updateSelection();
    }
    return super.update(options);
  }
  regenSlider(e) {
    this.$slider.noUiSlider.destroy();
    this.createSlider();
  }
  createSlider() {
    const labels = this.model.get("_options_labels");
    const min = 0;
    const max2 = labels.length - 1;
    const orientation = this.model.get("orientation");
    const behavior = this.model.get("behavior");
    import_nouislider3.default.create(this.$slider, {
      start: this.model.get("index"),
      connect: true,
      behaviour: behavior,
      range: {
        min,
        max: max2
      },
      step: 1,
      animate: false,
      orientation,
      direction: orientation === "horizontal" ? "ltr" : "rtl",
      format: {
        from: (value) => Number(value),
        to: (value) => Math.round(value)
      }
    });
    this.$slider.noUiSlider.on("update", (values, handle) => {
      this.handleSliderUpdateEvent(values, handle);
    });
    this.$slider.noUiSlider.on("change", (values, handle) => {
      this.handleSliderChangeEvent(values, handle);
    });
  }
  events() {
    return {
      slide: "handleSliderChange",
      slidestop: "handleSliderChanged"
    };
  }
  updateSelection() {
    const index = this.model.get("index");
    this.updateReadout(index);
  }
  updateReadout(index) {
    const value = this.model.get("_options_labels")[index];
    this.readout.textContent = value;
  }
  /**
   * Called whilst the slider is dragged, tapped or moved by the arrow keys.
   */
  handleSliderUpdateEvent(values, handle) {
    const index = values[0];
    this.updateReadout(index);
    if (this.model.get("continuous_update")) {
      this.handleSliderChanged(values, handle);
    }
  }
  /**
   * Called when the slider handle is released after dragging,
   * or by tapping or moving by the arrow keys.
   */
  handleSliderChangeEvent(values, handle) {
    const index = values[0];
    this.updateReadout(index);
    this.handleSliderChanged(values, handle);
  }
  /**
   * Called when the slider value has changed.
   *
   * Calling model.set will trigger all of the other views of the
   * model to update.
   */
  handleSliderChanged(values, handle) {
    const index = values[0];
    this.updateReadout(index);
    this.model.set("index", index, { updated_view: this });
    this.touch();
  }
  updateSliderOptions(e) {
    const labels = this.model.get("_options_labels");
    const min = 0;
    const max2 = labels.length - 1;
    this.$slider.noUiSlider.updateOptions({
      start: this.model.get("index"),
      range: {
        min,
        max: max2
      },
      step: 1
    });
  }
  updateSliderValue(model, _, options) {
    if (options.updated_view === this) {
      return;
    }
    const prev_index = this.$slider.noUiSlider.get();
    const index = this.model.get("index");
    if (prev_index !== index) {
      this.$slider.noUiSlider.set(index);
    }
  }
};
var MultipleSelectionModel = class extends SelectionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "MultipleSelectionModel" });
  }
};
var SelectMultipleModel = class extends MultipleSelectionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "SelectMultipleModel", _view_name: "SelectMultipleView", rows: null });
  }
};
var SelectMultipleView = class extends SelectView {
  /**
   * Public constructor.
   */
  initialize(parameters) {
    super.initialize(parameters);
    this.listbox.multiple = true;
  }
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("widget-select-multiple");
  }
  updateSelection() {
    const selected = this.model.get("index") || [];
    const listboxOptions = this.listbox.options;
    this.listbox.selectedIndex = -1;
    selected.forEach((i) => {
      listboxOptions[i].selected = true;
    });
  }
  /**
   * Handle when a new value is selected.
   */
  _handle_change() {
    const index = Array.prototype.map.call(this.listbox.selectedOptions || [], function(option) {
      return option.index;
    });
    this.model.set("index", index, { updated_view: this });
    this.touch();
  }
};
var SelectionRangeSliderModel = class extends MultipleSelectionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "SelectionSliderModel", _view_name: "SelectionSliderView", orientation: "horizontal", readout: true, continuous_update: true });
  }
};
var SelectionRangeSliderView = class extends SelectionSliderView {
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
  }
  updateSelection(index) {
    index = index || this.model.get("index");
    this.updateReadout(index);
  }
  updateReadout(index) {
    const labels = this.model.get("_options_labels");
    const minValue = labels[index[0]];
    const maxValue = labels[index[1]];
    this.readout.textContent = `${minValue}-${maxValue}`;
  }
  /**
   * Called when the slider value is changing.
   */
  handleSliderUpdateEvent(values, handle) {
    const intValues = values.map(Math.trunc);
    this.updateReadout(intValues);
    if (this.model.get("continuous_update")) {
      this.handleSliderChanged(values, handle);
    }
  }
  /**
   * Called when the slider value has changed.
   *
   * Calling model.set will trigger all of the other views of the
   * model to update.
   */
  handleSliderChanged(values, handle) {
    const intValues = values.map(Math.round);
    this.updateReadout(intValues);
    this.model.set("index", intValues.slice(), { updated_view: this });
    this.touch();
  }
  updateSliderValue(model, _, options) {
    if (options.updated_view === this) {
      return;
    }
    const prev_index = this.$slider.noUiSlider.get().map(Math.round);
    const index = this.model.get("index").map(Math.round);
    if (prev_index[0] !== index[0] || prev_index[1] !== index[1]) {
      this.$slider.noUiSlider.set(index);
    }
  }
};

// node_modules/@jupyter-widgets/controls/lib/lumino/tabpanel.js
var import_messaging4 = require("@lumino/messaging");
var import_signaling3 = require("@lumino/signaling");
var import_domutils3 = require("@lumino/domutils");
var EventedPanel = class extends Panel {
  constructor() {
    super(...arguments);
    this._widgetRemoved = new import_signaling3.Signal(this);
  }
  /**
   * A signal emitted when a widget is removed from the panel.
   */
  get widgetRemoved() {
    return this._widgetRemoved;
  }
  /**
   * A message handler invoked on a `'child-removed'` message.
   */
  onChildRemoved(msg) {
    this._widgetRemoved.emit(msg.child);
  }
};
var TabPanel = class extends Widget {
  /**
   * Construct a new tab panel.
   *
   * @param options - The options for initializing the tab panel.
   */
  constructor(options = {}) {
    super();
    this._currentChanged = new import_signaling3.Signal(this);
    this.addClass("jupyter-widget-TabPanel");
    this.tabBar = new TabBar(options);
    this.tabBar.addClass("jupyter-widget-TabPanel-tabBar");
    this.tabContents = new EventedPanel();
    this.tabContents.addClass("jupyter-widget-TabPanel-tabContents");
    this.tabBar.tabMoved.connect(this._onTabMoved, this);
    this.tabBar.currentChanged.connect(this._onCurrentChanged, this);
    this.tabBar.tabCloseRequested.connect(this._onTabCloseRequested, this);
    this.tabBar.tabActivateRequested.connect(this._onTabActivateRequested, this);
    this.tabContents.widgetRemoved.connect(this._onWidgetRemoved, this);
    const layout = new PanelLayout();
    layout.addWidget(this.tabBar);
    layout.addWidget(this.tabContents);
    this.layout = layout;
  }
  /**
   * A signal emitted when the current tab is changed.
   *
   * #### Notes
   * This signal is emitted when the currently selected tab is changed
   * either through user or programmatic interaction.
   *
   * Notably, this signal is not emitted when the index of the current
   * tab changes due to tabs being inserted, removed, or moved. It is
   * only emitted when the actual current tab node is changed.
   */
  get currentChanged() {
    return this._currentChanged;
  }
  /**
   * Get the index of the currently selected tab.
   *
   * #### Notes
   * This will be `null` if no tab is selected.
   */
  get currentIndex() {
    const currentIndex = this.tabBar.currentIndex;
    return currentIndex === -1 ? null : currentIndex;
  }
  /**
   * Set the index of the currently selected tab.
   *
   * #### Notes
   * If the index is out of range, it will be set to `null`.
   */
  set currentIndex(value) {
    this.tabBar.currentIndex = value === null ? -1 : value;
  }
  /**
   * Get the currently selected widget.
   *
   * #### Notes
   * This will be `null` if there is no selected tab.
   */
  get currentWidget() {
    const title = this.tabBar.currentTitle;
    return title ? title.owner : null;
  }
  /**
   * Set the currently selected widget.
   *
   * #### Notes
   * If the widget is not in the panel, it will be set to `null`.
   */
  set currentWidget(value) {
    this.tabBar.currentTitle = value ? value.title : null;
  }
  /**
   * Get the whether the tabs are movable by the user.
   *
   * #### Notes
   * Tabs can always be moved programmatically.
   */
  get tabsMovable() {
    return this.tabBar.tabsMovable;
  }
  /**
   * Set the whether the tabs are movable by the user.
   *
   * #### Notes
   * Tabs can always be moved programmatically.
   */
  set tabsMovable(value) {
    this.tabBar.tabsMovable = value;
  }
  /**
   * A read-only array of the widgets in the panel.
   */
  get widgets() {
    return this.tabContents.widgets;
  }
  /**
   * Add a widget to the end of the tab panel.
   *
   * @param widget - The widget to add to the tab panel.
   *
   * #### Notes
   * If the widget is already contained in the panel, it will be moved.
   *
   * The widget's `title` is used to populate the tab.
   */
  addWidget(widget) {
    this.insertWidget(this.widgets.length, widget);
  }
  /**
   * Insert a widget into the tab panel at a specified index.
   *
   * @param index - The index at which to insert the widget.
   *
   * @param widget - The widget to insert into to the tab panel.
   *
   * #### Notes
   * If the widget is already contained in the panel, it will be moved.
   *
   * The widget's `title` is used to populate the tab.
   */
  insertWidget(index, widget) {
    if (widget !== this.currentWidget) {
      widget.hide();
    }
    this.tabContents.insertWidget(index, widget);
    this.tabBar.insertTab(index, widget.title);
  }
  /**
   * Handle the `currentChanged` signal from the tab bar.
   */
  _onCurrentChanged(sender, args) {
    const { previousIndex, previousTitle, currentIndex, currentTitle } = args;
    const previousWidget = previousTitle ? previousTitle.owner : null;
    const currentWidget = currentTitle ? currentTitle.owner : null;
    if (previousWidget) {
      previousWidget.hide();
    }
    if (currentWidget) {
      currentWidget.show();
    }
    this._currentChanged.emit({
      previousIndex,
      previousWidget,
      currentIndex,
      currentWidget
    });
    if (import_domutils3.Platform.IS_EDGE || import_domutils3.Platform.IS_IE) {
      import_messaging4.MessageLoop.flush();
    }
  }
  /**
   * Handle the `tabActivateRequested` signal from the tab bar.
   */
  _onTabActivateRequested(sender, args) {
    args.title.owner.activate();
  }
  /**
   * Handle the `tabCloseRequested` signal from the tab bar.
   */
  _onTabCloseRequested(sender, args) {
    args.title.owner.close();
  }
  /**
   * Handle the `tabMoved` signal from the tab bar.
   */
  _onTabMoved(sender, args) {
    this.tabContents.insertWidget(args.toIndex, args.title.owner);
  }
  /**
   * Handle the `widgetRemoved` signal from the stacked panel.
   */
  _onWidgetRemoved(sender, widget) {
    this.tabBar.removeTab(widget.title);
  }
};

// node_modules/@jupyter-widgets/controls/lib/lumino/accordion.js
var import_algorithm6 = require("@lumino/algorithm");
var import_signaling5 = require("@lumino/signaling");

// node_modules/@jupyter-widgets/controls/lib/lumino/currentselection.js
var import_algorithm5 = require("@lumino/algorithm");
var import_signaling4 = require("@lumino/signaling");
var Selection = class {
  constructor(sequence, options = {}) {
    this._array = null;
    this._value = null;
    this._previousValue = null;
    this._selectionChanged = new import_signaling4.Signal(this);
    this._array = sequence;
    this._insertBehavior = options.insertBehavior || "select-item-if-needed";
    this._removeBehavior = options.removeBehavior || "select-item-after";
  }
  /**
   * A signal emitted when the current item is changed.
   *
   * #### Notes
   * This signal is emitted when the currently selected item is changed either
   * through user or programmatic interaction.
   *
   * Notably, this signal is not emitted when the index of the current item
   * changes due to other items being inserted, removed, or moved, but the
   * current item remains the same. It is only emitted when the actual current
   * item is changed.
   */
  get selectionChanged() {
    return this._selectionChanged;
  }
  /**
   * Adjust for setting an item.
   *
   * This should be called *after* the set.
   *
   * @param index - The index set.
   * @param oldValue - The old value at the index.
   */
  adjustSelectionForSet(index) {
    const pi = this.index;
    const pv = this.value;
    if (index !== pi) {
      return;
    }
    this._updateSelectedValue();
    const cv = this.value;
    this._previousValue = null;
    if (pv !== cv) {
      this._selectionChanged.emit({
        previousIndex: pi,
        previousValue: pv,
        currentIndex: pi,
        currentValue: cv
      });
    }
  }
  /**
   * Get the currently selected item.
   *
   * #### Notes
   * This will be `null` if no item is selected.
   */
  get value() {
    return this._value;
  }
  /**
   * Set the currently selected item.
   *
   * #### Notes
   * If the item does not exist in the vector, the currentValue will be set to
   * `null`. This selects the first entry equal to the desired item.
   */
  set value(value) {
    if (value === null || this._array === null) {
      this.index = null;
    } else {
      this.index = import_algorithm5.ArrayExt.firstIndexOf(this._array, value);
    }
  }
  /**
   * Get the index of the currently selected item.
   *
   * #### Notes
   * This will be `null` if no item is selected.
   */
  get index() {
    return this._index;
  }
  /**
   * Set the index of the currently selected tab.
   *
   * @param index - The index to select.
   *
   * #### Notes
   * If the value is out of range, the index will be set to `null`, which
   * indicates no item is selected.
   */
  set index(index) {
    let i;
    if (index !== null && this._array !== null) {
      i = Math.floor(index);
      if (i < 0 || i >= this._array.length) {
        i = null;
      }
    } else {
      i = null;
    }
    if (this._index === i) {
      return;
    }
    const pi = this._index;
    const pv = this._value;
    this._index = i;
    this._updateSelectedValue();
    this._previousValue = pv;
    this._selectionChanged.emit({
      previousIndex: pi,
      previousValue: pv,
      currentIndex: i,
      currentValue: this._value
    });
  }
  /**
   * Get the selection behavior when inserting a tab.
   */
  get insertBehavior() {
    return this._insertBehavior;
  }
  /**
   * Set the selection behavior when inserting a tab.
   */
  set insertBehavior(value) {
    this._insertBehavior = value;
  }
  /**
   * Get the selection behavior when removing a tab.
   */
  get removeBehavior() {
    return this._removeBehavior;
  }
  /**
   * Set the selection behavior when removing a tab.
   */
  set removeBehavior(value) {
    this._removeBehavior = value;
  }
  /**
   * Adjust the current index for a tab insert operation.
   *
   * @param i - The new index of the inserted item.
   * @param j - The inserted item.
   *
   * #### Notes
   * This method accounts for the tab bar's insertion behavior when adjusting
   * the current index and emitting the changed signal. This should be called
   * after the insertion.
   */
  adjustSelectionForInsert(i, item) {
    const cv = this._value;
    const ci = this._index;
    const bh = this._insertBehavior;
    if (bh === "select-item" || bh === "select-item-if-needed" && ci === null) {
      this._index = i;
      this._value = item;
      this._previousValue = cv;
      this._selectionChanged.emit({
        previousIndex: ci,
        previousValue: cv,
        currentIndex: i,
        currentValue: item
      });
      return;
    }
    if (ci !== null && ci >= i) {
      this._index++;
    }
  }
  /**
   * Clear the selection and history.
   */
  clearSelection() {
    const pi = this._index;
    const pv = this._value;
    this._index = null;
    this._value = null;
    this._previousValue = null;
    if (pi === null) {
      return;
    }
    this._selectionChanged.emit({
      previousIndex: pi,
      previousValue: pv,
      currentIndex: this._index,
      currentValue: this._value
    });
  }
  /**
   * Adjust the current index for an item remove operation.
   *
   * @param i - The former index of the removed item.
   * @param item - The removed item.
   *
   * #### Notes
   * This method accounts for the remove behavior when adjusting the current
   * index and emitting the changed signal. It should be called after the item
   * is removed.
   */
  adjustSelectionForRemove(i, item) {
    if (this._index === null) {
      return;
    }
    const ci = this._index;
    const bh = this._removeBehavior;
    if (ci !== i) {
      if (ci > i) {
        this._index--;
      }
      return;
    }
    if (!this._array || this._array.length === 0) {
      this._index = null;
      this._value = null;
      this._previousValue = null;
      this._selectionChanged.emit({
        previousIndex: i,
        previousValue: item,
        currentIndex: this._index,
        currentValue: this._value
      });
      return;
    }
    if (bh === "select-item-after") {
      this._index = Math.min(i, this._array.length - 1);
      this._updateSelectedValue();
      this._previousValue = null;
      this._selectionChanged.emit({
        previousIndex: i,
        previousValue: item,
        currentIndex: this._index,
        currentValue: this._value
      });
      return;
    }
    if (bh === "select-item-before") {
      this._index = Math.max(0, i - 1);
      this._updateSelectedValue();
      this._previousValue = null;
      this._selectionChanged.emit({
        previousIndex: i,
        previousValue: item,
        currentIndex: this._index,
        currentValue: this._value
      });
      return;
    }
    if (bh === "select-previous-item") {
      if (this._previousValue) {
        this.value = this._previousValue;
      } else {
        this._index = Math.min(i, this._array.length - 1);
        this._updateSelectedValue();
      }
      this._previousValue = null;
      this._selectionChanged.emit({
        previousIndex: i,
        previousValue: item,
        currentIndex: this._index,
        currentValue: this.value
      });
      return;
    }
    this._index = null;
    this._value = null;
    this._previousValue = null;
    this._selectionChanged.emit({
      previousIndex: i,
      previousValue: item,
      currentIndex: this._index,
      currentValue: this._value
    });
  }
  /**
   * Set the current value based on the current index.
   */
  _updateSelectedValue() {
    const i = this._index;
    this._value = i !== null && this._array ? this._array[i] : null;
  }
};

// node_modules/@jupyter-widgets/controls/lib/lumino/accordion.js
var COLLAPSE_CLASS = "jupyter-widget-Collapse";
var COLLAPSE_HEADER_CLASS = "jupyter-widget-Collapse-header";
var COLLAPSE_CONTENTS_CLASS = "jupyter-widget-Collapse-contents";
var COLLAPSE_CLASS_OPEN = "jupyter-widget-Collapse-open";
var Collapse = class extends Widget {
  constructor(options) {
    super(options);
    this._collapseChanged = new import_signaling5.Signal(this);
    this.addClass(COLLAPSE_CLASS);
    this._header = new Widget();
    this._header.addClass(COLLAPSE_HEADER_CLASS);
    this._header.node.addEventListener("click", this);
    const icon = document.createElement("i");
    icon.classList.add("fa", "fa-fw", "fa-caret-right");
    this._header.node.appendChild(icon);
    this._header.node.appendChild(document.createElement("span"));
    this._content = new Panel();
    this._content.addClass(COLLAPSE_CONTENTS_CLASS);
    const layout = new PanelLayout();
    this.layout = layout;
    layout.addWidget(this._header);
    layout.addWidget(this._content);
    if (options.widget) {
      this.widget = options.widget;
    }
    this.collapsed = false;
  }
  dispose() {
    if (this.isDisposed) {
      return;
    }
    super.dispose();
    this._header = null;
    this._widget = null;
    this._content = null;
  }
  get widget() {
    return this._widget;
  }
  set widget(widget) {
    const oldWidget = this._widget;
    if (oldWidget) {
      oldWidget.disposed.disconnect(this._onChildDisposed, this);
      oldWidget.title.changed.disconnect(this._onTitleChanged, this);
      oldWidget.parent = null;
    }
    this._widget = widget;
    widget.disposed.connect(this._onChildDisposed, this);
    widget.title.changed.connect(this._onTitleChanged, this);
    this._onTitleChanged(widget.title);
    this._content.addWidget(widget);
  }
  get collapsed() {
    return this._collapsed;
  }
  set collapsed(value) {
    if (value === this._collapsed) {
      return;
    }
    if (value) {
      this._collapse();
    } else {
      this._uncollapse();
    }
  }
  toggle() {
    this.collapsed = !this.collapsed;
  }
  get collapseChanged() {
    return this._collapseChanged;
  }
  _collapse() {
    this._collapsed = true;
    if (this._content) {
      this._content.hide();
    }
    this.removeClass(COLLAPSE_CLASS_OPEN);
    this._header.node.children[0].classList.add("fa-caret-right");
    this._header.node.children[0].classList.remove("fa-caret-down");
    this._collapseChanged.emit(void 0);
  }
  _uncollapse() {
    this._collapsed = false;
    if (this._content) {
      this._content.show();
    }
    this.addClass(COLLAPSE_CLASS_OPEN);
    this._header.node.children[0].classList.add("fa-caret-down");
    this._header.node.children[0].classList.remove("fa-caret-right");
    this._collapseChanged.emit(void 0);
  }
  /**
   * Handle the DOM events for the Collapse widget.
   *
   * @param event - The DOM event sent to the panel.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the panel's DOM node. It should
   * not be called directly by user code.
   */
  handleEvent(event) {
    switch (event.type) {
      case "click":
        this._evtClick(event);
        break;
      default:
        break;
    }
  }
  _evtClick(event) {
    this.toggle();
  }
  /**
   * Handle the `changed` signal of a title object.
   */
  _onTitleChanged(sender) {
    this._header.node.children[1].textContent = this._widget.title.label;
  }
  _onChildDisposed(sender) {
    this.dispose();
  }
};
var ACCORDION_CLASS = "jupyter-widget-Accordion";
var ACCORDION_CHILD_CLASS = "jupyter-widget-Accordion-child";
var ACCORDION_CHILD_ACTIVE_CLASS = "jupyter-widget-Accordion-child-active";
var Accordion = class extends Panel {
  constructor(options) {
    super(options);
    this._selection = new Selection(this.widgets);
    this._selection.selectionChanged.connect(this._onSelectionChanged, this);
    this.addClass(ACCORDION_CLASS);
  }
  /**
   * A read-only sequence of the widgets in the panel.
   *
   * #### Notes
   * This is a read-only property.
   */
  /*  get widgets(): ISequence<Widget> {
      return new ArraySequence(toArray(map((this.layout as PanelLayout).widgets, (w: Collapse) => w.widget)));
    }
  */
  get collapseWidgets() {
    return this.layout.widgets;
  }
  get selection() {
    return this._selection;
  }
  indexOf(widget) {
    return import_algorithm6.ArrayExt.findFirstIndex(this.collapseWidgets, (w) => w.widget === widget);
  }
  /**
   * Add a widget to the end of the accordion.
   *
   * @param widget - The widget to add to the accordion.
   *
   * @returns The Collapse widget wrapping the added widget.
   *
   * #### Notes
   * The widget will be wrapped in a CollapsedWidget.
   */
  addWidget(widget) {
    const collapse = this._wrapWidget(widget);
    collapse.collapsed = true;
    super.addWidget(collapse);
    this._selection.adjustSelectionForInsert(this.widgets.length - 1, collapse);
    return collapse;
  }
  /**
   * Insert a widget at the specified index.
   *
   * @param index - The index at which to insert the widget.
   *
   * @param widget - The widget to insert into to the accordion.
   *
   * #### Notes
   * If the widget is already contained in the panel, it will be moved.
   */
  insertWidget(index, widget) {
    const collapse = this._wrapWidget(widget);
    collapse.collapsed = true;
    super.insertWidget(index, collapse);
    this._selection.adjustSelectionForInsert(index, collapse);
  }
  removeWidget(widget) {
    const index = this.indexOf(widget);
    if (index >= 0) {
      const collapse = this.collapseWidgets[index];
      widget.parent = null;
      collapse.dispose();
      this._selection.adjustSelectionForRemove(index, null);
    }
  }
  _wrapWidget(widget) {
    const collapse = new Collapse({ widget });
    collapse.addClass(ACCORDION_CHILD_CLASS);
    collapse.collapseChanged.connect(this._onCollapseChange, this);
    return collapse;
  }
  _onCollapseChange(sender) {
    if (!sender.collapsed) {
      this._selection.value = sender;
    } else if (this._selection.value === sender && sender.collapsed) {
      this._selection.value = null;
    }
  }
  _onSelectionChanged(sender, change) {
    const pv = change.previousValue;
    const cv = change.currentValue;
    if (pv) {
      pv.collapsed = true;
      pv.removeClass(ACCORDION_CHILD_ACTIVE_CLASS);
    }
    if (cv) {
      cv.collapsed = false;
      cv.addClass(ACCORDION_CHILD_ACTIVE_CLASS);
    }
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_selectioncontainer.js
var import_algorithm7 = require("@lumino/algorithm");
var import_messaging5 = require("@lumino/messaging");
var import_jquery4 = __toESM(require("jquery"));
var SelectionContainerModel = class extends BoxModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "SelectionContainerModel", selected_index: null, titles: [] });
  }
};
var AccordionModel = class extends SelectionContainerModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "AccordionModel", _view_name: "AccordionView" });
  }
};
var JupyterLuminoAccordionWidget = class extends Accordion {
  constructor(options) {
    const view = options.view;
    delete options.view;
    super(options);
    this._view = view;
  }
  /**
   * Process the Lumino message.
   *
   * Any custom Lumino widget used inside a Jupyter widget should override
   * the processMessage function like this.
   */
  processMessage(msg) {
    var _a;
    super.processMessage(msg);
    (_a = this._view) === null || _a === void 0 ? void 0 : _a.processLuminoMessage(msg);
  }
  /**
   * Dispose the widget.
   *
   * This causes the view to be destroyed as well with 'remove'
   */
  dispose() {
    if (this.isDisposed) {
      return;
    }
    super.dispose();
    this._view.remove();
    this._view = null;
  }
};
var AccordionView = class extends DOMWidgetView {
  _createElement(tagName) {
    this.luminoWidget = new JupyterLuminoAccordionWidget({ view: this });
    return this.luminoWidget.node;
  }
  _setElement(el) {
    if (this.el || el !== this.luminoWidget.node) {
      throw new Error("Cannot reset the DOM element.");
    }
    this.el = this.luminoWidget.node;
    this.$el = (0, import_jquery4.default)(this.luminoWidget.node);
  }
  initialize(parameters) {
    super.initialize(parameters);
    this.children_views = new ViewList(this.add_child_view, this.remove_child_view, this);
    this.listenTo(this.model, "change:children", () => this.updateChildren());
    this.listenTo(this.model, "change:selected_index", () => this.update_selected_index());
    this.listenTo(this.model, "change:titles", () => this.update_titles());
  }
  /**
   * Called when view is rendered.
   */
  render() {
    var _a;
    super.render();
    const accordion = this.luminoWidget;
    accordion.addClass("jupyter-widgets");
    accordion.addClass("widget-accordion");
    accordion.addClass("widget-container");
    accordion.selection.selectionChanged.connect((sender) => {
      if (!this.updatingChildren) {
        this.model.set("selected_index", accordion.selection.index);
        this.touch();
      }
    });
    (_a = this.children_views) === null || _a === void 0 ? void 0 : _a.update(this.model.get("children"));
    this.update_titles();
    this.update_selected_index();
  }
  /**
   * Update children
   */
  updateChildren() {
    var _a;
    this.updatingChildren = true;
    this.luminoWidget.selection.index = null;
    (_a = this.children_views) === null || _a === void 0 ? void 0 : _a.update(this.model.get("children"));
    this.update_selected_index();
    this.updatingChildren = false;
  }
  /**
   * Set header titles
   */
  update_titles() {
    const collapsed = this.luminoWidget.collapseWidgets;
    const titles = this.model.get("titles");
    for (let i = 0; i < collapsed.length; i++) {
      if (titles[i] !== void 0) {
        collapsed[i].widget.title.label = titles[i];
      }
    }
  }
  /**
   * Make the rendering and selected index consistent.
   */
  update_selected_index() {
    this.luminoWidget.selection.index = this.model.get("selected_index");
  }
  /**
   * Called when a child is removed from children list.
   */
  remove_child_view(view) {
    this.luminoWidget.removeWidget(view.luminoWidget);
    view.remove();
  }
  /**
   * Called when a child is added to children list.
   */
  add_child_view(model, index) {
    const accordion = this.luminoWidget;
    const placeholder = new Widget();
    placeholder.title.label = this.model.get("titles")[index] || "";
    accordion.addWidget(placeholder);
    return this.create_child_view(model).then((view) => {
      const widget = view.luminoWidget;
      widget.title.label = placeholder.title.label;
      const collapse = accordion.collapseWidgets[accordion.indexOf(placeholder)];
      collapse.widget = widget;
      placeholder.dispose();
      return view;
    }).catch(reject("Could not add child view to box", true));
  }
  remove() {
    this.children_views = null;
    super.remove();
  }
};
var TabModel = class extends SelectionContainerModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "TabModel", _view_name: "TabView" });
  }
};
var JupyterLuminoTabPanelWidget = class extends TabPanel {
  constructor(options) {
    const view = options.view;
    delete options.view;
    super(options);
    this._view = view;
    import_messaging5.MessageLoop.installMessageHook(this.tabContents, (handler, msg) => {
      this._view.processLuminoMessage(msg);
      return true;
    });
  }
  /**
   * Dispose the widget.
   *
   * This causes the view to be destroyed as well with 'remove'
   */
  dispose() {
    if (this.isDisposed) {
      return;
    }
    super.dispose();
    this._view.remove();
    this._view = null;
  }
};
var TabView = class extends DOMWidgetView {
  constructor() {
    super(...arguments);
    this.updatingTabs = false;
  }
  _createElement(tagName) {
    this.luminoWidget = new JupyterLuminoTabPanelWidget({
      view: this
    });
    return this.luminoWidget.node;
  }
  _setElement(el) {
    if (this.el || el !== this.luminoWidget.node) {
      throw new Error("Cannot reset the DOM element.");
    }
    this.el = this.luminoWidget.node;
    this.$el = (0, import_jquery4.default)(this.luminoWidget.node);
  }
  /**
   * Public constructor.
   */
  initialize(parameters) {
    super.initialize(parameters);
    this.childrenViews = new ViewList(this.addChildView, (view) => {
      view.remove();
    }, this);
    this.listenTo(this.model, "change:children", () => this.updateTabs());
    this.listenTo(this.model, "change:titles", () => this.updateTitles());
  }
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    const tabs = this.luminoWidget;
    tabs.addClass("jupyter-widgets");
    tabs.addClass("widget-container");
    tabs.addClass("jupyter-widget-tab");
    tabs.addClass("widget-tab");
    tabs.tabsMovable = true;
    tabs.tabBar.insertBehavior = "none";
    tabs.tabBar.currentChanged.connect(this._onTabChanged, this);
    tabs.tabBar.tabMoved.connect(this._onTabMoved, this);
    tabs.tabBar.addClass("widget-tab-bar");
    tabs.tabContents.addClass("widget-tab-contents");
    tabs.tabBar.tabsMovable = false;
    this.updateTabs();
    this.update();
  }
  /**
   * Render tab views based on the current model's children.
   */
  updateTabs() {
    var _a;
    this.updatingTabs = true;
    this.luminoWidget.currentIndex = null;
    (_a = this.childrenViews) === null || _a === void 0 ? void 0 : _a.update(this.model.get("children"));
    this.luminoWidget.currentIndex = this.model.get("selected_index");
    this.updatingTabs = false;
  }
  /**
   * Called when a child is added to children list.
   */
  addChildView(model, index) {
    const label = this.model.get("titles")[index] || "";
    const tabs = this.luminoWidget;
    const placeholder = new Widget();
    placeholder.title.label = label;
    tabs.addWidget(placeholder);
    return this.create_child_view(model).then((view) => {
      const widget = view.luminoWidget;
      widget.title.label = placeholder.title.label;
      widget.title.closable = false;
      const i = import_algorithm7.ArrayExt.firstIndexOf(tabs.widgets, placeholder);
      tabs.insertWidget(i + 1, widget);
      placeholder.dispose();
      return view;
    }).catch(reject("Could not add child view to box", true));
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed.  The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update() {
    this.updateSelectedIndex();
    return super.update();
  }
  /**
   * Updates the tab page titles.
   */
  updateTitles() {
    const titles = this.model.get("titles") || [];
    (0, import_algorithm7.each)(this.luminoWidget.widgets, (widget, i) => {
      widget.title.label = titles[i] || "";
    });
  }
  /**
   * Updates the selected index.
   */
  updateSelectedIndex() {
    this.luminoWidget.currentIndex = this.model.get("selected_index");
  }
  remove() {
    this.childrenViews = null;
    super.remove();
  }
  _onTabChanged(sender, args) {
    if (!this.updatingTabs) {
      const i = args.currentIndex;
      this.model.set("selected_index", i === -1 ? null : i);
      this.touch();
    }
  }
  /**
   * Handle the `tabMoved` signal from the tab bar.
   */
  _onTabMoved(sender, args) {
    const children = this.model.get("children").slice();
    import_algorithm7.ArrayExt.move(children, args.fromIndex, args.toIndex);
    this.model.set("children", children);
    this.touch();
  }
};
var StackModel = class extends SelectionContainerModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "StackModel", _view_name: "StackView" });
  }
};
var StackView = class extends BoxView {
  initialize(parameters) {
    super.initialize(parameters);
    this.listenTo(this.model, "change:selected_index", this.update_children);
  }
  update_children() {
    var _a;
    let child;
    if (this.model.get("selected_index") === null) {
      child = [];
    } else {
      child = [this.model.get("children")[this.model.get("selected_index")]];
    }
    (_a = this.children_views) === null || _a === void 0 ? void 0 : _a.update(child).then((views) => {
      views.forEach((view) => {
        import_messaging5.MessageLoop.postMessage(view.luminoWidget, Widget.ResizeMessage.UnknownSize);
      });
    });
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_tagsinput.js
var d3Color = __toESM(require("d3-color"));
var d3Format = __toESM(require("d3-format"));
function trim(value) {
  return value.replace(/^\s+|\s+$/g, "");
}
function clamp(value, min, max2) {
  return Math.min(Math.max(value, min), max2);
}
function removeChildren(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}
var Selection2 = class {
  constructor(start, dx, max2) {
    this.start = start;
    this.dx = dx;
    this.max = max2;
  }
  /**
   * Check if a given index is currently selected.
   */
  isSelected(index) {
    let min;
    let max2;
    if (this.dx >= 0) {
      min = this.start;
      max2 = this.start + this.dx;
    } else {
      min = this.start + this.dx;
      max2 = this.start;
    }
    return min <= index && index < max2;
  }
  /**
   * Update selection
   */
  updateSelection(dx) {
    this.dx += dx;
    if (this.start + this.dx > this.max) {
      this.dx = this.max - this.start;
    }
    if (this.start + this.dx < 0) {
      this.dx = -this.start;
    }
  }
};
var TagsInputBaseModel = class extends CoreDOMWidgetModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { value: [], placeholder: "\u200B", allowed_tags: null, allow_duplicates: true });
  }
};
var TagsInputBaseView = class extends DOMWidgetView {
  constructor() {
    super(...arguments);
    this.hoveredTag = null;
    this.hoveredTagIndex = null;
  }
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("jupyter-widget-tagsinput");
    this.taginputWrapper = document.createElement("div");
    if (this.model.get("value").length) {
      this.taginputWrapper.style.display = "none";
    } else {
      this.taginputWrapper.style.display = "inline-block";
    }
    this.datalistID = uuid();
    this.taginput = document.createElement("input");
    this.taginput.classList.add("jupyter-widget-tag");
    this.taginput.classList.add("jupyter-widget-taginput");
    this.taginput.setAttribute("list", this.datalistID);
    this.taginput.setAttribute("type", "text");
    this.autocompleteList = document.createElement("datalist");
    this.autocompleteList.id = this.datalistID;
    this.updateAutocomplete();
    this.model.on("change:allowed_tags", this.updateAutocomplete.bind(this));
    this.updatePlaceholder();
    this.model.on("change:placeholder", this.updatePlaceholder.bind(this));
    this.taginputWrapper.classList.add("widget-text");
    this.taginputWrapper.appendChild(this.taginput);
    this.taginputWrapper.appendChild(this.autocompleteList);
    this.el.onclick = this.focus.bind(this);
    this.el.ondrop = (event) => {
      const index = this.hoveredTagIndex == null ? this.tags.length : this.hoveredTagIndex;
      return this.ondrop(event, index);
    };
    this.el.ondragover = this.ondragover.bind(this);
    this.taginput.onchange = this.handleValueAdded.bind(this);
    this.taginput.oninput = this.resizeInput.bind(this);
    this.taginput.onkeydown = this.handleKeyEvent.bind(this);
    this.taginput.onblur = this.loseFocus.bind(this);
    this.resizeInput();
    this.inputIndex = this.model.get("value").length;
    this.selection = null;
    this.preventLoosingFocus = false;
    this.update();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed. The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update() {
    this.preventLoosingFocus = true;
    removeChildren(this.el);
    this.tags = [];
    const value = this.model.get("value");
    this.inputIndex = value.length;
    for (const idx in value) {
      const index = parseInt(idx);
      const tag = this.createTag(value[index], index, this.selection != null && this.selection.isSelected(index));
      tag.draggable = true;
      tag.ondragstart = /* @__PURE__ */ ((index2, value2) => {
        return (event) => {
          this.ondragstart(event, index2, value2, this.model.model_id);
        };
      })(index, value[index]);
      tag.ondrop = /* @__PURE__ */ ((index2) => {
        return (event) => {
          this.ondrop(event, index2);
        };
      })(index);
      tag.ondragover = this.ondragover.bind(this);
      tag.ondragenter = /* @__PURE__ */ ((index2) => {
        return (event) => {
          this.ondragenter(event, index2);
        };
      })(index);
      tag.ondragend = this.ondragend.bind(this);
      this.tags.push(tag);
      this.el.appendChild(tag);
    }
    this.el.insertBefore(this.taginputWrapper, this.el.children[this.inputIndex]);
    if (this.model.get("value").length) {
      this.taginputWrapper.style.display = "none";
    } else {
      this.taginputWrapper.style.display = "inline-block";
    }
    this.preventLoosingFocus = false;
    return super.update();
  }
  /**
   * Update the auto-completion list
   */
  updateAutocomplete() {
    removeChildren(this.autocompleteList);
    const allowedTags = this.model.get("allowed_tags");
    for (const tag of allowedTags) {
      const option = document.createElement("option");
      option.value = tag;
      this.autocompleteList.appendChild(option);
    }
  }
  /**
   * Update the auto-completion list
   */
  updatePlaceholder() {
    this.taginput.placeholder = this.model.get("placeholder");
    this.resizeInput();
  }
  /**
   * Update the tags, called when the selection has changed and we need to update the tags CSS
   */
  updateTags() {
    const value = this.model.get("value");
    for (const idx in this.tags) {
      const index = parseInt(idx);
      this.updateTag(this.tags[index], value[index], index, this.selection != null && this.selection.isSelected(index));
    }
  }
  /**
   * Handle a new value is added from the input element
   */
  handleValueAdded(event) {
    const newTagValue = trim(this.taginput.value);
    const tagIndex = this.inputIndex;
    if (newTagValue == "") {
      return;
    }
    this.inputIndex++;
    const tagAdded = this.addTag(tagIndex, newTagValue);
    if (tagAdded) {
      this.taginput.value = "";
      this.resizeInput();
      this.focus();
    }
  }
  /**
   * Add a new tag with a value of `tagValue` at the `index` position
   * Return true if the tag was correctly added, false otherwise
   */
  addTag(index, tagValue) {
    const value = this.model.get("value");
    let newTagValue;
    try {
      newTagValue = this.validateValue(tagValue);
    } catch (error) {
      return false;
    }
    const allowedTagValues = this.model.get("allowed_tags");
    if (allowedTagValues.length && !allowedTagValues.includes(newTagValue)) {
      return false;
    }
    if (!this.model.get("allow_duplicates") && value.includes(newTagValue)) {
      return false;
    }
    this.selection = null;
    const newValue = [...value];
    newValue.splice(index, 0, newTagValue);
    this.model.set("value", newValue);
    this.model.save_changes();
    return true;
  }
  /**
   * Resize the input element
   */
  resizeInput() {
    let content;
    if (this.taginput.value.length != 0) {
      content = this.taginput.value;
    } else {
      content = this.model.get("placeholder");
    }
    const size = content.length + 1;
    this.taginput.setAttribute("size", String(size));
  }
  /**
   * Handle key events on the input element
   */
  handleKeyEvent(event) {
    const valueLength = this.model.get("value").length;
    if (this.taginput.value.length) {
      return;
    }
    const currentElement = this.inputIndex;
    switch (event.key) {
      case "ArrowLeft":
        if (event.ctrlKey && event.shiftKey) {
          this.select(currentElement, -currentElement);
        }
        if (!event.ctrlKey && event.shiftKey) {
          this.select(currentElement, -1);
        }
        if (event.ctrlKey) {
          this.inputIndex = 0;
        } else {
          this.inputIndex--;
        }
        break;
      case "ArrowRight":
        if (event.ctrlKey && event.shiftKey) {
          this.select(currentElement, valueLength - currentElement);
        }
        if (!event.ctrlKey && event.shiftKey) {
          this.select(currentElement, 1);
        }
        if (event.ctrlKey) {
          this.inputIndex = valueLength;
        } else {
          this.inputIndex++;
        }
        break;
      case "Backspace":
        if (this.selection) {
          this.removeSelectedTags();
        } else {
          this.removeTag(this.inputIndex - 1);
        }
        break;
      case "Delete":
        if (this.selection) {
          this.removeSelectedTags();
        } else {
          this.removeTag(this.inputIndex);
        }
        break;
      default:
        return;
        break;
    }
    if (!event.shiftKey) {
      this.selection = null;
    }
    this.inputIndex = clamp(this.inputIndex, 0, valueLength);
    this.update();
    this.focus();
  }
  /**
   * Function that gets called when a tag with a given `value` is being dragged.
   */
  ondragstart(event, index, tagValue, origin) {
    if (event.dataTransfer == null) {
      return;
    }
    event.dataTransfer.setData("index", String(index));
    event.dataTransfer.setData("tagValue", String(tagValue));
    event.dataTransfer.setData("origin", origin);
  }
  /**
   * Function that gets called when a tag has been dragged on the tag at the `index` position.
   */
  ondrop(event, index) {
    if (event.dataTransfer == null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const draggedTagValue = event.dataTransfer.getData("tagValue");
    const draggedTagindex = parseInt(event.dataTransfer.getData("index"));
    const sameOrigin = event.dataTransfer.getData("origin") == this.model.model_id;
    if (isNaN(draggedTagindex)) {
      return;
    }
    if (sameOrigin) {
      const value = this.model.get("value");
      const newValue = [...value];
      if (draggedTagindex < index) {
        index--;
      }
      newValue.splice(draggedTagindex, 1);
      newValue.splice(index, 0, draggedTagValue);
      this.model.set("value", newValue);
      this.model.save_changes();
      return;
    }
    this.addTag(index, draggedTagValue);
  }
  ondragover(event) {
    event.preventDefault();
  }
  ondragenter(event, index) {
    if (this.hoveredTag != null && this.hoveredTag != this.tags[index]) {
      this.hoveredTag.style.marginLeft = "1px";
    }
    this.hoveredTag = this.tags[index];
    this.hoveredTagIndex = index;
    this.hoveredTag.style.marginLeft = "30px";
  }
  ondragend() {
    if (this.hoveredTag != null) {
      this.hoveredTag.style.marginLeft = "1px";
    }
    this.hoveredTag = null;
    this.hoveredTagIndex = null;
  }
  /**
   * Select tags from `start` to `start + dx` not included.
   */
  select(start, dx) {
    const valueLength = this.model.get("value").length;
    if (!this.selection) {
      this.selection = new Selection2(start, dx, valueLength);
    } else {
      this.selection.updateSelection(dx);
    }
  }
  /**
   * Remove all the selected tags.
   */
  removeSelectedTags() {
    const value = [...this.model.get("value")];
    const valueLength = value.length;
    for (let idx = valueLength - 1; idx >= 0; idx--) {
      if (this.selection != null && this.selection.isSelected(idx)) {
        value.splice(idx, 1);
        if (idx < this.inputIndex) {
          this.inputIndex--;
        }
      }
    }
    this.model.set("value", value);
    this.model.save_changes();
  }
  /**
   * Remove a tag given its index in the list
   */
  removeTag(tagIndex) {
    const value = [...this.model.get("value")];
    value.splice(tagIndex, 1);
    if (tagIndex < this.inputIndex) {
      this.inputIndex--;
    }
    this.model.set("value", value);
    this.model.save_changes();
  }
  /**
   * Focus on the input element
   */
  focus() {
    this.taginputWrapper.style.display = "inline-block";
    this.taginput.focus();
  }
  /**
   * Lose focus on the input element
   */
  loseFocus() {
    if (this.preventLoosingFocus) {
      return;
    }
    if (this.model.get("value").length) {
      this.taginputWrapper.style.display = "none";
    }
    this.selection = null;
    this.updateTags();
  }
  preinitialize() {
    this.tagName = "div";
  }
  /**
   * Validate an input tag typed by the user, returning the correct tag type. This should be overridden in subclasses.
   */
  validateValue(value) {
    return value;
  }
};
var TagsInputModel = class extends TagsInputBaseModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { value: [], tag_style: "", _view_name: "TagsInputView", _model_name: "TagsInputModel" });
  }
};
var TagsInputView = class _TagsInputView extends TagsInputBaseView {
  /**
   * Create the string tag
   */
  createTag(value, index, selected) {
    const tag = document.createElement("div");
    const style = this.model.get("tag_style");
    tag.classList.add("jupyter-widget-tag");
    tag.classList.add(_TagsInputView.class_map[style]);
    if (selected) {
      tag.classList.add("mod-active");
    }
    tag.appendChild(document.createTextNode(this.getTagText(value)));
    const i = document.createElement("i");
    i.classList.add("fa");
    i.classList.add("fa-times");
    i.classList.add("jupyter-widget-tag-close");
    tag.appendChild(i);
    i.onmousedown = /* @__PURE__ */ ((index2) => {
      return () => {
        this.removeTag(index2);
        this.loseFocus();
      };
    })(index);
    return tag;
  }
  /**
   * Returns the text that should be displayed in the tag element
   */
  getTagText(value) {
    return value;
  }
  /**
   * Update a given tag
   */
  updateTag(tag, value, index, selected) {
    if (selected) {
      tag.classList.add("mod-active");
    } else {
      tag.classList.remove("mod-active");
    }
  }
};
TagsInputView.class_map = {
  primary: "mod-primary",
  success: "mod-success",
  info: "mod-info",
  warning: "mod-warning",
  danger: "mod-danger"
};
var ColorsInputModel = class extends TagsInputBaseModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { value: [], _view_name: "ColorsInputView", _model_name: "ColorsInputModel" });
  }
};
var ColorsInputView = class extends TagsInputBaseView {
  /**
   * Create the Color tag
   */
  createTag(value, index, selected) {
    const tag = document.createElement("div");
    const color2 = value;
    const darkerColor = d3Color.color(value).darker().toString();
    tag.classList.add("jupyter-widget-tag");
    tag.classList.add("jupyter-widget-colortag");
    if (!selected) {
      tag.style.backgroundColor = color2;
    } else {
      tag.classList.add("mod-active");
      tag.style.backgroundColor = darkerColor;
    }
    const i = document.createElement("i");
    i.classList.add("fa");
    i.classList.add("fa-times");
    i.classList.add("jupyter-widget-tag-close");
    tag.appendChild(i);
    i.onmousedown = /* @__PURE__ */ ((index2) => {
      return () => {
        this.removeTag(index2);
        this.loseFocus();
      };
    })(index);
    return tag;
  }
  /**
   * Update a given tag
   */
  updateTag(tag, value, index, selected) {
    const color2 = value;
    const darkerColor = d3Color.color(value).darker().toString();
    if (!selected) {
      tag.classList.remove("mod-active");
      tag.style.backgroundColor = color2;
    } else {
      tag.classList.add("mod-active");
      tag.style.backgroundColor = darkerColor;
    }
  }
  /**
   * Validate an input tag typed by the user, returning the correct tag type. This should be overridden in subclasses.
   */
  validateValue(value) {
    if (d3Color.color(value) == null) {
      throw value + " is not a valid Color";
    }
    return value;
  }
};
var NumbersInputModel = class extends TagsInputModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { min: null, max: null });
  }
};
var NumbersInputView = class extends TagsInputView {
  render() {
    this.model.on("change:format", () => {
      this.formatter = d3Format.format(this.model.get("format"));
      this.update();
    });
    this.formatter = d3Format.format(this.model.get("format"));
    super.render();
  }
  /**
   * Returns the text that should be displayed in the tag element
   */
  getTagText(value) {
    return this.formatter(this.parseNumber(value));
  }
  /**
   * Validate an input tag typed by the user, returning the correct tag type. This should be overridden in subclasses.
   */
  validateValue(value) {
    const parsed = this.parseNumber(value);
    const min = this.model.get("min");
    const max2 = this.model.get("max");
    if (isNaN(parsed) || min != null && parsed < min || max2 != null && parsed > max2) {
      throw value + " is not a valid number, it should be in the range [" + min + ", " + max2 + "]";
    }
    return parsed;
  }
};
var FloatsInputModel = class extends NumbersInputModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _view_name: "FloatsInputView", _model_name: "FloatsInputModel", format: ".1f" });
  }
};
var FloatsInputView = class extends NumbersInputView {
  parseNumber(value) {
    return parseFloat(value);
  }
};
var IntsInputModel = class extends NumbersInputModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _view_name: "IntsInputView", _model_name: "IntsInputModel", format: "d" });
  }
};
var IntsInputView = class extends NumbersInputView {
  parseNumber(value) {
    const int = parseInt(value);
    if (int != parseFloat(value)) {
      throw value + " should be an integer";
    }
    return int;
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_string.js
var INVALID_VALUE_CLASS = "jpwidgets-invalidComboValue";
var StringStyleModel = class extends DescriptionStyleModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "StringStyleModel", _model_module: "@jupyter-widgets/controls", _model_module_version: JUPYTER_CONTROLS_VERSION });
  }
};
StringStyleModel.styleProperties = Object.assign(Object.assign({}, DescriptionStyleModel.styleProperties), { background: {
  selector: "",
  attribute: "background",
  default: null
}, font_size: {
  selector: "",
  attribute: "font-size",
  default: ""
}, text_color: {
  selector: "",
  attribute: "color",
  default: ""
} });
var HTMLStyleModel = class extends StringStyleModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "HTMLStyleModel", _model_module: "@jupyter-widgets/controls", _model_module_version: JUPYTER_CONTROLS_VERSION });
  }
};
HTMLStyleModel.styleProperties = Object.assign({}, StringStyleModel.styleProperties);
var HTMLMathStyleModel = class extends StringStyleModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "HTMLMathStyleModel", _model_module: "@jupyter-widgets/controls", _model_module_version: JUPYTER_CONTROLS_VERSION });
  }
};
HTMLMathStyleModel.styleProperties = Object.assign({}, StringStyleModel.styleProperties);
var LabelStyleModel = class extends StringStyleModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "LabelStyleModel", _model_module: "@jupyter-widgets/controls", _model_module_version: JUPYTER_CONTROLS_VERSION });
  }
};
LabelStyleModel.styleProperties = Object.assign(Object.assign({}, StringStyleModel.styleProperties), { font_family: {
  selector: "",
  attribute: "font-family",
  default: ""
}, font_style: {
  selector: "",
  attribute: "font-style",
  default: ""
}, font_variant: {
  selector: "",
  attribute: "font-variant",
  default: ""
}, font_weight: {
  selector: "",
  attribute: "font-weight",
  default: ""
}, text_decoration: {
  selector: "",
  attribute: "text-decoration",
  default: ""
} });
var TextStyleModel = class extends DescriptionStyleModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "TextStyleModel", _model_module: "@jupyter-widgets/controls", _model_module_version: JUPYTER_CONTROLS_VERSION });
  }
};
TextStyleModel.styleProperties = Object.assign(Object.assign({}, DescriptionStyleModel.styleProperties), { background: {
  selector: ".widget-input",
  attribute: "background",
  default: null
}, font_size: {
  selector: ".widget-input",
  attribute: "font-size",
  default: ""
}, text_color: {
  selector: ".widget-input",
  attribute: "color",
  default: ""
} });
var StringModel = class extends CoreDescriptionModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { value: "", disabled: false, placeholder: "\u200B", _model_name: "StringModel" });
  }
};
var StringView = class extends DescriptionView {
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-inline-hbox");
  }
};
var HTMLModel = class extends StringModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _view_name: "HTMLView", _model_name: "HTMLModel" });
  }
};
var HTMLView = class extends StringView {
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("widget-html");
    this.content = document.createElement("div");
    this.content.classList.add("widget-html-content");
    this.el.appendChild(this.content);
    this.update();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed.  The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update() {
    this.content.innerHTML = this.model.get("value");
    return super.update();
  }
  /**
   * Handle message sent to the front end.
   */
  handle_message(content) {
    if (content.do === "focus") {
      this.content.focus();
    } else if (content.do === "blur") {
      this.content.blur();
    }
  }
};
var HTMLMathModel = class extends StringModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _view_name: "HTMLMathView", _model_name: "HTMLMathModel" });
  }
};
var HTMLMathView = class extends StringView {
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("widget-htmlmath");
    this.content = document.createElement("div");
    this.content.classList.add("widget-htmlmath-content");
    this.el.appendChild(this.content);
    this.update();
  }
  /**
   * Update the contents of this view
   */
  update() {
    this.content.innerHTML = this.model.get("value");
    this.typeset(this.content);
    return super.update();
  }
  /**
   * Handle message sent to the front end.
   */
  handle_message(content) {
    if (content.do === "focus") {
      this.content.focus();
    } else if (content.do === "blur") {
      this.content.blur();
    }
  }
};
var LabelModel = class extends StringModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _view_name: "LabelView", _model_name: "LabelModel" });
  }
};
var LabelView = class extends StringView {
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("widget-label");
    this.update();
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed.  The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update() {
    this.typeset(this.el, this.model.get("value"));
    return super.update();
  }
};
var TextareaModel = class extends StringModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _view_name: "TextareaView", _model_name: "TextareaModel", rows: null, continuous_update: true });
  }
};
var TextareaView = class extends StringView {
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("widget-textarea");
    this.textbox = document.createElement("textarea");
    this.textbox.setAttribute("rows", "5");
    this.textbox.id = this.label.htmlFor = uuid();
    this.textbox.classList.add("widget-input");
    this.el.appendChild(this.textbox);
    this.update();
    this.listenTo(this.model, "change:placeholder", (model, value, options) => {
      this.update_placeholder(value);
    });
    this.update_placeholder();
    this.updateTooltip();
  }
  update_placeholder(value) {
    const v = value || this.model.get("placeholder");
    this.textbox.setAttribute("placeholder", v.toString());
  }
  /**
   * Update the contents of this view
   *
   * Called when the model is changed.  The model may have been
   * changed by another view or by a state update from the back-end.
   */
  update(options) {
    if (options === void 0 || options.updated_view !== this) {
      this.textbox.value = this.model.get("value");
      let rows = this.model.get("rows");
      if (rows === null) {
        rows = "";
      }
      this.textbox.setAttribute("rows", rows);
      this.textbox.disabled = this.model.get("disabled");
    }
    this.updateTabindex();
    this.updateTooltip();
    return super.update();
  }
  updateTabindex() {
    if (!this.textbox) {
      return;
    }
    const tabbable = this.model.get("tabbable");
    if (tabbable === true) {
      this.textbox.setAttribute("tabIndex", "0");
    } else if (tabbable === false) {
      this.textbox.setAttribute("tabIndex", "-1");
    } else if (tabbable === null) {
      this.textbox.removeAttribute("tabIndex");
    }
  }
  updateTooltip() {
    if (!this.textbox)
      return;
    const title = this.model.get("tooltip");
    if (!title) {
      this.textbox.removeAttribute("title");
    } else if (this.model.get("description").length === 0) {
      this.textbox.setAttribute("title", title);
    }
  }
  events() {
    return {
      "keydown textarea": "handleKeyDown",
      "keypress textarea": "handleKeypress",
      "input textarea": "handleChanging",
      "change textarea": "handleChanged"
    };
  }
  /**
   * Handle key down
   *
   * Stop propagation so the event isn't sent to the application.
   */
  handleKeyDown(e) {
    e.stopPropagation();
  }
  /**
   * Handles key press
   *
   * Stop propagation so the keypress isn't sent to the application.
   */
  handleKeypress(e) {
    e.stopPropagation();
  }
  /**
   * Triggered on input change
   */
  handleChanging(e) {
    if (this.model.get("continuous_update")) {
      this.handleChanged(e);
    }
  }
  /**
   * Sync the value with the kernel.
   *
   * @param e Event
   */
  handleChanged(e) {
    const target = e.target;
    this.model.set("value", target.value, { updated_view: this });
    this.touch();
  }
  /**
   * Handle message sent to the front end.
   */
  handle_message(content) {
    if (content.do === "focus") {
      this.textbox.focus();
    } else if (content.do === "blur") {
      this.textbox.blur();
    }
  }
};
var TextModel = class extends StringModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _view_name: "TextView", _model_name: "TextModel", continuous_update: true });
  }
};
var TextView = class extends StringView {
  constructor() {
    super(...arguments);
    this.inputType = "text";
  }
  /**
   * Called when view is rendered.
   */
  render() {
    super.render();
    this.el.classList.add("widget-text");
    this.textbox = document.createElement("input");
    this.textbox.setAttribute("type", this.inputType);
    this.textbox.id = this.label.htmlFor = uuid();
    this.textbox.classList.add("widget-input");
    this.el.appendChild(this.textbox);
    this.update();
    this.listenTo(this.model, "change:placeholder", (model, value, options) => {
      this.update_placeholder(value);
    });
    this.update_placeholder();
    this.updateTabindex();
    this.updateTooltip();
  }
  update_placeholder(value) {
    this.textbox.setAttribute("placeholder", value || this.model.get("placeholder"));
  }
  updateTabindex() {
    if (!this.textbox) {
      return;
    }
    const tabbable = this.model.get("tabbable");
    if (tabbable === true) {
      this.textbox.setAttribute("tabIndex", "0");
    } else if (tabbable === false) {
      this.textbox.setAttribute("tabIndex", "-1");
    } else if (tabbable === null) {
      this.textbox.removeAttribute("tabIndex");
    }
  }
  updateTooltip() {
    if (!this.textbox)
      return;
    const title = this.model.get("tooltip");
    if (!title) {
      this.textbox.removeAttribute("title");
    } else if (this.model.get("description").length === 0) {
      this.textbox.setAttribute("title", title);
    }
  }
  update(options) {
    if (options === void 0 || options.updated_view !== this) {
      if (this.textbox.value !== this.model.get("value")) {
        this.textbox.value = this.model.get("value");
      }
      this.textbox.disabled = this.model.get("disabled");
    }
    return super.update();
  }
  events() {
    return {
      "keydown input": "handleKeyDown",
      "keypress input": "handleKeypress",
      "input input": "handleChanging",
      "change input": "handleChanged"
    };
  }
  /**
   * Handle key down
   *
   * Stop propagation so the keypress isn't sent to the application.
   */
  handleKeyDown(e) {
    e.stopPropagation();
  }
  /**
   * Handles text submission
   */
  handleKeypress(e) {
    e.stopPropagation();
    if (e.keyCode === 13) {
      this.send({ event: "submit" });
    }
  }
  /**
   * Handles user input.
   *
   * Calling model.set will trigger all of the other views of the
   * model to update.
   */
  handleChanging(e) {
    if (this.model.get("continuous_update")) {
      this.handleChanged(e);
    }
  }
  /**
   * Handles user input.
   *
   * Calling model.set will trigger all of the other views of the
   * model to update.
   */
  handleChanged(e) {
    const target = e.target;
    this.model.set("value", target.value, { updated_view: this });
    this.touch();
  }
  /**
   * Handle message sent to the front end.
   */
  handle_message(content) {
    if (content.do === "focus") {
      this.textbox.focus();
    } else if (content.do === "blur") {
      this.textbox.blur();
    }
  }
};
var PasswordModel = class extends TextModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _view_name: "PasswordView", _model_name: "PasswordModel" });
  }
};
var PasswordView = class extends TextView {
  constructor() {
    super(...arguments);
    this.inputType = "password";
  }
};
var ComboboxModel = class extends TextModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "ComboboxModel", _view_name: "ComboboxView", options: [], ensure_options: false });
  }
};
var ComboboxView = class extends TextView {
  constructor() {
    super(...arguments);
    this.isInitialRender = true;
  }
  render() {
    this.datalist = document.createElement("datalist");
    this.datalist.id = uuid();
    super.render();
    this.textbox.setAttribute("list", this.datalist.id);
    this.el.appendChild(this.datalist);
    this.updateTooltip();
  }
  update(options) {
    super.update(options);
    if (!this.datalist) {
      return;
    }
    const valid = this.isValid(this.model.get("value"));
    this.highlightValidState(valid);
    if (options !== void 0 && options.updated_view || !this.model.hasChanged("options") && !this.isInitialRender) {
      return;
    }
    this.isInitialRender = false;
    const opts = this.model.get("options");
    const optionFragment = document.createDocumentFragment();
    for (const v of opts) {
      const o = document.createElement("option");
      o.value = v;
      optionFragment.appendChild(o);
    }
    this.datalist.replaceChildren(...optionFragment.children);
  }
  isValid(value) {
    if (true === this.model.get("ensure_option")) {
      const options = this.model.get("options");
      if (options.indexOf(value) === -1) {
        return false;
      }
    }
    return true;
  }
  handleChanging(e) {
    const target = e.target;
    const valid = this.isValid(target.value);
    this.highlightValidState(valid);
    if (valid) {
      super.handleChanging(e);
    }
  }
  handleChanged(e) {
    const target = e.target;
    const valid = this.isValid(target.value);
    this.highlightValidState(valid);
    if (valid) {
      super.handleChanged(e);
    }
  }
  /**
   * Handle message sent to the front end.
   */
  handle_message(content) {
    if (content.do === "focus") {
      this.textbox.focus();
    } else if (content.do === "blur") {
      this.textbox.blur();
    }
  }
  highlightValidState(valid) {
    this.textbox.classList.toggle(INVALID_VALUE_CLASS, !valid);
  }
};

// node_modules/@jupyter-widgets/controls/lib/widget_upload.js
var FileUploadModel = class extends CoreDOMWidgetModel {
  defaults() {
    return Object.assign(Object.assign({}, super.defaults()), { _model_name: "FileUploadModel", _view_name: "FileUploadView", accept: "", description: "Upload", disabled: false, icon: "upload", button_style: "", multiple: false, value: [], error: "", style: null });
  }
};
FileUploadModel.serializers = Object.assign(Object.assign({}, CoreDOMWidgetModel.serializers), {
  // use a dummy serializer for value to circumvent the default serializer.
  value: { serialize: (x) => x }
});
var FileUploadView = class _FileUploadView extends DOMWidgetView {
  preinitialize() {
    this.tagName = "button";
  }
  render() {
    super.render();
    this.el.classList.add("jupyter-widgets");
    this.el.classList.add("widget-upload");
    this.el.classList.add("jupyter-button");
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.style.display = "none";
    this.el.addEventListener("click", () => {
      this.fileInput.click();
    });
    this.fileInput.addEventListener("click", () => {
      this.fileInput.value = "";
    });
    this.fileInput.addEventListener("change", () => {
      var _a;
      const promisesFile = [];
      Array.from((_a = this.fileInput.files) !== null && _a !== void 0 ? _a : []).forEach((file) => {
        promisesFile.push(new Promise((resolve, reject3) => {
          const fileReader = new FileReader();
          fileReader.onload = () => {
            const content = fileReader.result;
            resolve({
              content,
              name: file.name,
              type: file.type,
              size: file.size,
              last_modified: file.lastModified
            });
          };
          fileReader.onerror = () => {
            reject3();
          };
          fileReader.onabort = fileReader.onerror;
          fileReader.readAsArrayBuffer(file);
        }));
      });
      Promise.all(promisesFile).then((files) => {
        this.model.set({
          value: files,
          error: ""
        });
        this.touch();
      }).catch((err) => {
        console.error("error in file upload: %o", err);
        this.model.set({
          error: err
        });
        this.touch();
      });
    });
    this.listenTo(this.model, "change:button_style", this.update_button_style);
    this.set_button_style();
    this.update();
  }
  update() {
    this.el.disabled = this.model.get("disabled");
    this.el.setAttribute("title", this.model.get("tooltip"));
    const value = this.model.get("value");
    const description = `${this.model.get("description")} (${value.length})`;
    const icon = this.model.get("icon");
    if (description.length || icon.length) {
      this.el.textContent = "";
      if (icon.length) {
        const i = document.createElement("i");
        i.classList.add("fa");
        i.classList.add("fa-" + icon);
        if (description.length === 0) {
          i.classList.add("center");
        }
        this.el.appendChild(i);
      }
      this.el.appendChild(document.createTextNode(description));
    }
    this.fileInput.accept = this.model.get("accept");
    this.fileInput.multiple = this.model.get("multiple");
    return super.update();
  }
  update_button_style() {
    this.update_mapped_classes(_FileUploadView.class_map, "button_style", this.el);
  }
  set_button_style() {
    this.set_mapped_classes(_FileUploadView.class_map, "button_style", this.el);
  }
};
FileUploadView.class_map = {
  primary: ["mod-primary"],
  success: ["mod-success"],
  info: ["mod-info"],
  warning: ["mod-warning"],
  danger: ["mod-danger"]
};

// node_modules/@jupyter-widgets/controls/lib/index.js
var version = require_package().version;
