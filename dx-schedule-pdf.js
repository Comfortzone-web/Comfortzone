'use strict';

// Landscape letter, logos and full-width grouped engineering table follow the approved PDF.
function renderDxSchedulePdf(payload, {PDFDocument,columns,companyLogo,dealerLogo}) {
  const doc=new PDFDocument({size:'LETTER',layout:'landscape',margin:0,bufferPages:true,autoFirstPage:false,info:{Title:'DX Schedule',Author:'Comfort Zone AC'}});
  const chunks=[];
  const result=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  const margin=30,width=732,bottom=582;
  // Relative widths follow the reference's 30 columns. No technical fields are omitted.
  const weights=[39,39,49,22,22,21,77,15,23,35,30,21,21,20,19,17,28,16,17,19,17,33,15,16,16,15,16,16,20,20];
  const scale=width/weights.reduce((sum,v)=>sum+v,0),ws=weights.map(w=>w*scale),xs=[margin];ws.forEach(w=>xs.push(xs.at(-1)+w));
  const fields=[['Project',payload.projectName],['Client',payload.customerName],['Consultant',payload.consultant],['Contractor',payload.contractor]].filter(([,value])=>String(value??'').trim());
  const bodyFont=4.1,lineHeight=5.1,padding=1;
  let y;
  function cell(x,top,w,h,text,fill='#ffffff',bold=false,size=4.1) {
    doc.rect(x,top,w,h).fillAndStroke(fill,'#373737');
    if(text===null || text===undefined || text==='')return;
    doc.fillColor('#111111').font(bold?'Helvetica-Bold':'Helvetica').fontSize(size);
    const options={width:w-2,align:'center',lineGap:0};
    const textHeight=doc.heightOfString(String(text),options);
    doc.text(String(text),x+1,top+Math.max(.7,(h-textHeight)/2),{...options,height:h-1,ellipsis:false});
  }
  function span(col,count,top,h,text,fill,bold=true,size=4.1) {cell(xs[col],top,xs[col+count]-xs[col],h,text,fill,bold,size);}
  function tableHeader(top) {
    const grey='#D9D9D9',blue='#8DB4E2';doc.lineWidth(.35);
    span(0,6,top,9,'SPECIFIED',grey,true,4.6);span(6,24,top,9,'PROPOSED',blue,true,4.6);
    const t=top+9;
    ['Ref','Type','Location','TKw','SKw','L/S','Model ( Indoor / Outdoor )','Qty','NOMINAL\nTR','Type','Refrigerant'].forEach((label,index)=>span(index,1,t,27,label,index<6?grey:blue));
    span(11,2,t,9,'Temperature',blue);span(11,2,t+9,9,'degC',blue);span(11,1,t+18,9,'Indoor',blue);span(12,1,t+18,9,'Outdoor',blue);
    span(13,2,t,18,'Capacity (KW)',blue);span(13,1,t+18,9,'TC',blue);span(14,1,t+18,9,'SC',blue);
    span(15,1,t,18,'AFR',blue);span(15,1,t+18,9,'L/S',blue);span(16,1,t,27,'SPEED',blue);
    span(17,2,t,18,'Power Input, KW',blue);span(17,1,t+18,9,'Actual',blue);span(18,1,t+18,9,'ESMA',blue);
    span(19,1,t,18,'COP',blue);span(19,1,t+18,9,'W/W',blue);span(20,1,t,27,'ESP',blue);span(21,1,t,27,'Power Supply',blue);
    span(22,3,t,9,'Dimensions',blue);span(22,3,t+9,9,'Indoor, mm',blue);
    span(25,3,t,9,'Dimensions',blue);span(25,3,t+9,9,'Outdoor, mm',blue);
    ['H','W','D'].forEach((label,i)=>{span(22+i,1,t+18,9,label,blue);span(25+i,1,t+18,9,label,blue);});
    span(28,2,t,9,'Weight',blue);span(28,1,t+9,9,'Indoor',blue);span(29,1,t+9,9,'Outdoor',blue);span(28,1,t+18,9,'kg',blue);span(29,1,t+18,9,'kg',blue);
    return top+36;
  }
  function page() {
    doc.addPage();
    const logoTop=20,logoHeight=22.8;
    doc.image(companyLogo,margin,logoTop,{fit:[66,logoHeight],align:'left',valign:'center'});
    doc.image(dealerLogo,margin+width-48,logoTop,{fit:[48,logoHeight],align:'right',valign:'center'});
    let top=logoTop+logoHeight+8;
    for(const [label,value] of fields) {
      doc.font('Helvetica').fontSize(6.5);
      const height=Math.max(9,doc.heightOfString(String(value).trim(),{width:width-53}));
      doc.font('Helvetica-Bold').text(label+':',margin+1,top,{width:50,lineBreak:false});
      doc.font('Helvetica').text(String(value).trim(),margin+53,top,{width:width-53});
      top+=height+1;
    }
    y=tableHeader(Math.max(78,top+3));
  }
  function wrap(value,w) {
    doc.font('Helvetica').fontSize(bodyFont);
    const lines=[];
    for(const paragraph of String(value??'').replace(/\r\n/g,'\n').split('\n')) {
      let line='';
      for(const word of paragraph.split(/\s+/)) {
        const candidate=line?line+' '+word:word;
        if(doc.widthOfString(candidate)<=w-2)line=candidate;
        else {
          if(line)lines.push(line);line='';
          for(const char of word){if(line && doc.widthOfString(line+char)>w-2){lines.push(line);line='';}line+=char;}
        }
      }
      lines.push(line);
    }
    return lines;
  }
  function displayValue(column,value) {
    const text=String(value??'');
    if(!/^-?\d+(?:\.\d+)?$/.test(text))return text;
    const number=Number(text);
    if(column==='COP (W/W)')return number.toFixed(2);
    if(column==='NOMINAL TR')return number.toFixed(1);
    if(column==='TKw' || column==='SKw')return number.toFixed(Math.max(2,Math.min(6,(text.split('.')[1] || '').length)));
    return text;
  }
  const rows=(payload.rows || []).filter(row=>columns.some(column=>String(row[column]??'').trim()!==''));
  page();
  for(const row of rows.length?rows:Array.from({length:6},()=>({}))) {
    const lines=columns.map((column,index)=>wrap(displayValue(column,row[column]),ws[index]));
    const total=Math.max(1,...lines.map(value=>value.length));let offset=0;
    const fullHeight=Math.max(6.8,total*lineHeight+padding*2);
    if(y+fullHeight>bottom && fullHeight<bottom-150)page();
    while(offset<total) {
      if(bottom-y<lineHeight+padding*2)page();
      const take=Math.max(1,Math.min(total-offset,Math.floor((bottom-y-padding*2)/lineHeight)));
      const h=Math.max(6.8,take*lineHeight+padding*2);
      for(let col=0;col<columns.length;col++) {
        doc.lineWidth(.3).rect(xs[col],y,ws[col],h).stroke('#444444');
        doc.font('Helvetica').fontSize(bodyFont).fillColor('#111111');
        const segment=lines[col].slice(offset,offset+take);
        if(offset>0 && col===0 && !segment.length)segment.push(lines[col][0]);
        segment.forEach((line,i)=>doc.text(line,xs[col]+1,y+padding+i*lineHeight,{width:ws[col]-2,align:'center',lineBreak:false}));
      }
      y+=h;offset+=take;
      if(offset<total)page();
    }
  }
  const pages=doc.bufferedPageRange();
  for(let index=0;index<pages.count;index++) {
    doc.switchToPage(index);doc.font('Helvetica').fontSize(5).fillColor('#666666').text(`${index+1} / ${pages.count}`,margin,591,{width,align:'right',lineBreak:false});
  }
  doc.end();return result;
}
module.exports={renderDxSchedulePdf};
