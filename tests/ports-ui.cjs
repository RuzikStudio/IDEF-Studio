const {_electron,expect}=require('@playwright/test');const path=require('path');
(async()=>{const app=await _electron.launch({executablePath:path.resolve(process.argv[2]),args:['--test']});try{
 const p=await app.firstWindow();await p.locator('[data-node-id]').first().click();
 const add=p.getByRole('button',{name:'Добавить механизм',exact:true});for(let i=0;i<9;i++)await add.click();
 const read=()=>p.locator('[data-arrow-id] polyline[marker-end]').evaluateAll(lines=>lines.map(l=>Array.from(l.points,p=>({x:p.x,y:p.y}))).filter(ps=>ps[0].y>ps.at(-1).y && ps[0].y>700));
 let paths=await read();if(paths.length!==12)throw Error('Expected 12 mechanisms: '+paths.length);
 await p.locator('[data-node-id]').first().click();await p.getByRole('button',{name:'Развести граничные стрелки'}).click();
 paths=await read();if(new Set(paths.map(ps=>ps.at(-1).x)).size!==12 || !paths.every(ps=>ps.every(pt=>Math.abs(pt.x-ps[0].x)<.01)))throw Error('Mechanisms are not separate straight lines');
 console.log('Packaged editor: 12 straight mechanisms at distinct ports');
}finally{await app.evaluate(({app})=>app.exit());}})().catch(e=>{console.error(e);process.exitCode=1});
