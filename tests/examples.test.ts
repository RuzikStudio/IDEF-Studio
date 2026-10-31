import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoProject} from '../src/demo';
import {idef3Demo} from '../src/idef3Demo';
import {serialize,parseProject} from '../src/model';
test('new teaching examples are populated and survive save/open',()=>{for(const p of [demoProject(),idef3Demo()]){assert.ok(Object.keys(p.diagrams).length>1);assert.ok(p.diagrams[p.rootId].arrows.length>0);assert.deepEqual(parseProject(serialize(p)),p);}assert.equal(demoProject().title,'Изготовление мебели на заказ');const p=idef3Demo();assert.equal(p.diagrams[p.rootId].nodes.filter(n=>n.junction==='XOR').length,2);});
