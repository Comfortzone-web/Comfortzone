const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),PDFDocument=require('pdfkit');
const {PDFDocument:Reader}=require('pdf-lib');
const {renderDxSchedulePdf}=require('../dx-schedule-pdf');
const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');const columns=vm.runInNewContext(source.match(/const dxScheduleColumns = (\[[\s\S]*?\]);/)[1]);
let printed=[];
class RecordingPdf extends PDFDocument { text(value,...args){printed.push(String(value));return super.text(value,...args);} }
const assets={PDFDocument:RecordingPdf,columns,companyLogo:path.join(__dirname,'../public/assets/dx-export-comfort-zone.png'),dealerLogo:path.join(__dirname,'../public/assets/dx-export-daikin.png')};
test('DX PDF is landscape letter with both reference logos, repeated grouped headings and all source rows',async()=>{
 printed=[];const rows=Array.from({length:100},(_,i)=>({Ref:`TEST-${String(i).padStart(3,'0')}`,Type:'DUCTED',Location:i===0?'Apartment LR\nApartment Storage':'Office',TKw:10,SKw:9,'L/S':800,'Outdoor Weight (kg)':120}));
 const buffer=await renderDxSchedulePdf({projectName:'Project Value',customerName:'Client Value',consultant:'Consultant Value',contractor:'Contractor Value',rows},assets);
 const document=await Reader.load(buffer);assert.ok(document.getPageCount()>1);
 for(const page of document.getPages()){assert.equal(page.getWidth(),792);assert.equal(page.getHeight(),612);assert.equal(page.node.Resources().lookup(require('pdf-lib').PDFName.of('XObject')).keys().length,2);}
 for(const row of rows)assert.equal(printed.filter(value=>value===row.Ref).length,1);
 for(const label of ['SPECIFIED','PROPOSED','Project:','Client:','Consultant:','Contractor:'])assert.equal(printed.filter(value=>value===label).length,document.getPageCount());
 assert.ok(printed.includes('Apartment LR'));assert.ok(printed.includes('Apartment Storage'));assert.ok(printed.includes('120'));
});
test('DX PDF excludes blank project metadata labels and retains actual populated details',async()=>{
 printed=[];await renderDxSchedulePdf({projectName:'Real Project',customerName:'',consultant:'   ',contractor:'Real Contractor',rows:[]},assets);
 assert.ok(printed.includes('Project:'));assert.ok(printed.includes('Real Project'));assert.ok(printed.includes('Contractor:'));assert.ok(printed.includes('Real Contractor'));assert.ok(!printed.includes('Client:'));assert.ok(!printed.includes('Consultant:'));
});
