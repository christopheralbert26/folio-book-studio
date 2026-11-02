export async function mapConcurrent(items, limit, work) {
 if (!Number.isInteger(limit) || limit < 1) throw Error('Invalid concurrency');
 const results=new Array(items.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
  while(cursor<items.length){const index=cursor++;results[index]=await work(items[index],index);}
 }));
 return results;
}
