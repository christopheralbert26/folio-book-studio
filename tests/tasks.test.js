import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapConcurrent} from '../src/tasks.js';
test('library requests preserve order and respect concurrency even when completions differ',async()=>{
 let active=0,peak=0;
 const result=await mapConcurrent([30,5,10,1,2],2,async(n,i)=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,n));active--;return i;});
 assert.deepEqual(result,[0,1,2,3,4]);assert.equal(peak,2);
 assert.deepEqual(await mapConcurrent([],4,()=>assert.fail()),[]);
 await assert.rejects(mapConcurrent([1],1,()=>{throw Error('offline');}),/offline/);
});
