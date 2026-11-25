// Entirely synthetic test materials. No customer or supplier opening data.
const rows=Array.from({length:184},(_,i)=>{
 const n=i+1,model=`TEST-MODEL-${n}`,sd=`TEST-SD-${n}`,sor=`5S-TEST-${n}`,poNo=`TEST-PO-${n}`,supplierItem=String(n);
 const amount=i===0?1:i===1?1:i===2?7:i<30?4:5;
 return {id:`test-line-${n}`,sourceKey:[sd,sor,poNo,supplierItem,model].join('|'),model,sd,sor,poNo,supplierItem,project:`Synthetic Project ${n}`,orderQty:amount,confirmedQty:amount,priceCents:i===2?1496083:10000,opening:true};
});
rows[182].orderQty+=4;rows[182].confirmedQty+=4;rows[183].orderQty=rows[183].confirmedQty=1;
rows[183].priceCents=298522418-rows.slice(0,-1).reduce((n,l)=>n+l.confirmedQty*l.priceCents,0);
module.exports=rows;
