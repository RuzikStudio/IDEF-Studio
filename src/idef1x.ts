import {newProject,addBlock,addArrow,nodeEnd,type Diagram,type Block} from './model';
export type Attribute={name:string;pk:boolean;fk:boolean};
export function attributes(d:Diagram,n:Block,seen=new Set<string>()):Attribute[]{
 if(seen.has(n.id))return [];const path=new Set(seen).add(n.id);
 const local=(n.attributes||'').split('\n').map(s=>s.trim()).filter(Boolean).map(s=>({name:s.replace(/^PK\s+/i,''),pk:/^PK\s+/i.test(s),fk:false}));
 for(const a of d.arrows){if(a.target?.kind!=='node'||a.target.nodeId!==n.id||a.source?.kind!=='node')continue;const parent=d.nodes.find(x=>x.id===(a.source as {nodeId:string}).nodeId);if(!parent)continue;
 for(const key of attributes(d,parent,path).filter(x=>x.pk)){const name=`${parent.name}.${key.name}`;if(!local.some(x=>x.name===name))local.push({name,pk:a.identifying===true,fk:true});}}
 return local.sort((a,b)=>Number(b.pk)-Number(a.pk));
}
export function idef1xDemo(){const p=newProject('Заказы интернет-магазина','IDEF1X'),d=p.rootId;
 const customer=addBlock(p,d,'Клиент',140,230),order=addBlock(p,d,'Заказ',550,230),item=addBlock(p,d,'Позиция заказа',980,420),product=addBlock(p,d,'Товар',550,600);
 customer.attributes='PK client_id\nИмя\nEmail';order.attributes='PK order_id\nДата\nСтатус';item.attributes='PK Номер позиции\nКоличество\nЦена';product.attributes='PK product_id\nНазвание\nСтоимость';
 const connect=(s:Block,t:Block,identifying:boolean)=>{const a=addArrow(p,d,nodeEnd(s.id,'right'),nodeEnd(t.id,'left'),'');a.identifying=identifying;};connect(customer,order,false);connect(order,item,true);connect(product,item,false);
 return p;}
