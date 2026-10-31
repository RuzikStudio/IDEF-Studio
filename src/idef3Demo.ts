import {newProject,addBlock,addArrow,nodeEnd,decompose} from './model';

export function idef3Demo(){
 const p=newProject('Обработка заявки на ремонт','IDEF3');
 p.organization='Учебный сервисный центр';
 p.author='Сценарий с альтернативными путями XOR';
 const d=p.rootId;
 const receive=addBlock(p,d,'Принять устройство',100,330);
 const diagnose=addBlock(p,d,'Провести диагностику',400,330);
 diagnose.description='Определить неисправность и возможность ремонта. Двойной щелчок открывает подробный сценарий диагностики.';
 const fork=addBlock(p,d,'XOR',700,340);fork.junction='XOR';fork.w=80;fork.h=80;
 fork.description='Разветвление: выполняется ровно один путь — ремонт или оформление отказа.';
 const repair=addBlock(p,d,'Отремонтировать устройство',850,180);
 const refuse=addBlock(p,d,'Оформить отказ от ремонта',850,510);
 const join=addBlock(p,d,'XOR',1140,340);join.junction='XOR';join.w=80;join.h=80;
 join.description='Слияние альтернатив: продолжение после завершения выбранного пути.';
 const deliver=addBlock(p,d,'Выдать устройство и документы',1130,660);deliver.w=240;
 const link=(from:string,to:string,label='',source:'right'|'bottom'='right',target:'left'|'top'='left')=>addArrow(p,d,nodeEnd(from,source),nodeEnd(to,target),label);
 link(receive.id,diagnose.id);link(diagnose.id,fork.id);
 link(fork.id,repair.id,'Ремонт согласован');link(fork.id,refuse.id,'Ремонт невозможен или отклонён');
 link(repair.id,join.id);link(refuse.id,join.id);link(join.id,deliver.id,'','bottom','top');
 const child=decompose(p,d,diagnose.id,0);
 const steps=['Осмотреть устройство','Проверить узлы','Составить заключение'].map((name,i)=>addBlock(p,child,name,180+i*390,260+i*100));
 for(let i=1;i<steps.length;i++)addArrow(p,child,nodeEnd(steps[i-1].id,'right'),nodeEnd(steps[i].id,'left'),'');
 return p;
}
