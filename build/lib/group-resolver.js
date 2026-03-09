"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var group_resolver_exports = {};
__export(group_resolver_exports, {
  buildGroupNameOptions: () => buildGroupNameOptions,
  resolveGroups: () => resolveGroups
});
module.exports = __toCommonJS(group_resolver_exports);
function buildGroupNameOptions(groups) {
  return groups.map((g) => ({ value: g.name, label: g.name }));
}
function resolveGroups(groups, datapoints, log) {
  const groupMap = /* @__PURE__ */ new Map();
  for (const group of groups) {
    groupMap.set(group.name, group);
  }
  const resolved = /* @__PURE__ */ new Map();
  for (const group of groups) {
    resolved.set(group.name, { group, datapoints: [] });
  }
  for (const dp of datapoints) {
    if (!dp.enabled) {
      continue;
    }
    if (!groupMap.has(dp.group)) {
      log.warn(
        `Data point "${dp.objectId}" references unknown group "${dp.group}". Available groups: ${[...groupMap.keys()].join(", ")}`
      );
      continue;
    }
    resolved.get(dp.group).datapoints.push(dp);
  }
  return [...resolved.values()];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildGroupNameOptions,
  resolveGroups
});
//# sourceMappingURL=group-resolver.js.map
