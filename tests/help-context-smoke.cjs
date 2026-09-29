const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const helpSource = fs.readFileSync('หอพัก/help.js','utf8');
const manual = fs.readFileSync('USER-MANUAL.md','utf8');

const sandbox = {window:null,console};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(helpSource,sandbox,{filename:'help.js'});

const help = sandbox.DelightHelp;
assert.ok(help,'DelightHelp API missing');

const requiredIds = [
  'login',
  'dashboard',
  'rooms',
  'tenants',
  'bills',
  'reports',
  'import-export',
  'tenant-home'
];

for(const id of requiredIds){
  const section = help.extractSection(manual,id);
  assert.ok(section.length > 20,'missing or empty help section: '+id);
}

const markers = [...manual.matchAll(/<!--\s*help-id:\s*([^\s]+)\s*-->/g)].map(m=>m[1]);
assert.equal(new Set(markers).size,markers.length,'duplicate help-id in USER-MANUAL.md');

const rendered = help.renderMarkdown('## ทดสอบ\n\n- รายการ **สำคัญ**');
assert.ok(rendered.includes('<h3>ทดสอบ</h3>'));
assert.ok(rendered.includes('<strong>สำคัญ</strong>'));
assert.ok(helpSource.includes('./docs/USER-MANUAL.md'),'static manual source missing');

console.log('context_help_docs_smoke=PASS', {helpSections:requiredIds.length});
