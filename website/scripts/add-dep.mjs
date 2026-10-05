// DISABLED: node_modules is relocated to D: behind per-package junctions; `npm install` would treat them as
// extraneous and prune them. Ask the coordinator to add a dependency.
console.error('add-dep is disabled: ask the coordinator to add dependencies (node_modules layout is protected).');
process.exit(1);
