/* VRV manual selection rules transcribed from VRV_Auto_Selection_Template_Mudassir.xlsx. */
window.VrvManual = (() => {
  let catalog;
  let loading;
  const numeric = value => Number(String(value ?? '').replace(/,/g,''));
  const valid = value => value !== '' && value != null && Number.isFinite(numeric(value)) && numeric(value) >= 0;
  const load = () => loading ||= fetch('/vrv-manual-catalog.json').then(response => {
    if (!response.ok) throw new Error('Could not load the VRV selection catalog.');
    return response.json();
  }).then(value => catalog = value).catch(error => { loading = null; throw error; });
  const types = () => [...new Set((catalog?.indoor || []).map(item => item.type).filter(Boolean))];
  const origins = () => [...new Set((catalog?.indoor || []).map(item => item.origin).filter(Boolean))];
  function selectIndoor(row, settings) {
    if ([row.tc,settings.matchSC?row.sc:'',settings.matchAirflow?row.airflow:''].some(value=>value!==''&&value!=null&&(!Number.isFinite(numeric(value))||numeric(value)<0)))
      return {status:'Invalid Requirement',model:''};
    if (!valid(row.tc) || numeric(row.tc) <= 0)
      return { status: 'Incomplete Input', model: '' };
    const candidates = catalog.indoor.filter(item =>
      numeric(item.maxTC) >= numeric(row.tc) &&
      (!settings.matchSC || row.sc === '' || row.sc == null || numeric(item.maxSC) >= numeric(row.sc)) &&
      (!settings.matchAirflow || row.airflow === '' || row.airflow == null || numeric(item.airflow) >= numeric(row.airflow)) &&
      (!row.type || row.type === 'Any' || item.type === row.type) &&
      (!row.origin || row.origin === 'Any' || item.origin === row.origin));
    candidates.sort((a,b) => numeric(a.index) - numeric(b.index));
    return candidates.length ? { status: 'Selected', ...candidates[0] } : { status: 'No Matching Model', model: '' };
  }
  const comboId = combo => combo.id || [combo.series,combo.a,combo.b,combo.c].join('|');
  const modules = combo => [combo.a,combo.b,combo.c].filter(Boolean);
  function structuredCombo(combo) {
    const parts=modules(combo).map(model=>catalog.outdoor.find(item=>item.model===model));
    const index=parts.reduce((sum,item)=>sum+numeric(item?.index),0);
    const hp=parts.reduce((sum,item)=>sum+numeric(item?.hp),0);
    const catalogValid=parts.length>0 && parts.every(Boolean) && parts.length===numeric(combo.modules) &&
      parts.every(item=>item.series===combo.series) && Math.abs(index-numeric(combo.index))<0.001 && Math.abs(hp-numeric(combo.hp))<0.001;
    return {...combo,id:comboId(combo),index,hp,modules:parts.length,moduleData:parts.map(item=>({model:item?.model,index:item?.index,hp:item?.hp})),catalogValid};
  }
  function eligibleCombos(row,settings) {
    if(!catalog || !Number.isFinite(row.requiredIndex))return [];
    return catalog.combos.map(structuredCombo).filter(combo=>combo.catalogValid && combo.series===row.series &&
      combo.index>=row.requiredIndex-0.0000001 && combo.modules<=numeric(settings.maxModules) && combo.hp<=numeric(settings.maxHP) &&
      row.index/combo.index*100<=numeric(settings.maxCR)+0.0000001).sort((a,b)=>numeric(a.sortKey)-numeric(b.sortKey));
  }
  function selectOutdoor(system, rows, settings, previous = {}) {
    const indoor=rows.filter(row=>row.system.trim()===system);
    const selected=indoor.filter(row=>row.selection?.status==='Selected');
    const index=selected.reduce((sum,row)=>sum+numeric(row.selection.index),0);
    const target=previous.targetOverride ? numeric(previous.targetCR) : numeric(settings.targetCR);
    const seriesPreference=previous.seriesPreference||'Auto';
    const recommendedSeries=selected.length ? (selected.every(row=>row.selection.origin==='India')?'RXQ':'RXYTQ') : '';
    const series=seriesPreference==='Auto'?recommendedSeries:seriesPreference;
    const seriesOverride=seriesPreference!=='Auto';
    const requiredIndex=target>0?Math.round(index/(target/100)*1e6)/1e6:NaN;
    const overrideKey=previous.overrideKey||'';
    const manualOverride=previous.selectionMode==='Manual Override'||Boolean(overrideKey);
    const selectedComboId=manualOverride?(overrideKey||previous.selectedComboId):'';
    const base={system,count:indoor.length,index,targetCR:target,targetOverride:!!previous.targetOverride,
      recommendedSeries,series,seriesPreference,seriesOverride,requiredIndex,overrideKey,selectedComboId,
      selectionMode:manualOverride?'Manual Override':'Automatic',recommendedComboId:'',seriesRecommendedComboId:'',selectedIndex:0,totalHP:0};
    if(!indoor.length)return {...base,validationStatus:'Incomplete',status:'Awaiting indoor units'};
    if(selected.length!==indoor.length)return {...base,validationStatus:'Incomplete',status:'Incomplete indoor selection'};
    if(!valid(target)||target<=0||target>numeric(settings.maxCR))return {...base,validationStatus:'Invalid',status:'Invalid — Target CR exceeds the allowed limit'};
    if(!['RXQ','RXYTQ'].includes(series))return {...base,validationStatus:'Invalid',status:'Invalid — Outdoor series is unavailable'};
    const eligible=eligibleCombos(base,settings);
    const recommended=eligible[0];
    base.seriesRecommendedComboId=recommended?.id||'';
    base.recommendedComboId=eligibleCombos({...base,series:recommendedSeries},settings)[0]?.id||'';
    let chosen=recommended;
    if(manualOverride){
      const source=catalog.combos.find(combo=>comboId(combo)===selectedComboId || [combo.a,combo.b,combo.c].join('|')===selectedComboId);
      if(!source)return {...base,validationStatus:'Invalid',status:'Invalid — Manual combination is not in the catalog'};
      chosen=structuredCombo(source);
      base.selectedComboId=chosen.id;
      base.overrideKey=chosen.id;
    }
    if(!chosen){
      const sameSeries=catalog.combos.map(structuredCombo).filter(combo=>combo.catalogValid&&combo.series===series);
      const sized=sameSeries.filter(combo=>combo.index>=requiredIndex-0.0000001);
      const withinModules=sized.filter(combo=>combo.modules<=numeric(settings.maxModules));
      const reason=!sameSeries.length?'series unavailable':!sized.length?'required index exceeds catalog':!withinModules.length?'module limit':'system capacity limit';
      return {...base,validationStatus:'No Match',status:`No Match — ${reason}`};
    }
    const achievedCR=index/chosen.index*100;
    const selectedData={...base,combo:chosen,selectedComboId:chosen.id,selectedIndex:chosen.index,totalHP:chosen.hp,achievedCR};
    if(!chosen.catalogValid||!eligible.some(combo=>combo.id===chosen.id)){
      const reason=!chosen.catalogValid?'catalog modules do not match the combination':chosen.series!==series?'outdoor series mismatch':chosen.index<requiredIndex?'outdoor index below target':chosen.modules>numeric(settings.maxModules)?'module limit exceeded':chosen.hp>numeric(settings.maxHP)?'system capacity exceeded':'maximum CR exceeded';
      return {...selectedData,validationStatus:'Invalid',status:`Invalid — ${reason}`};
    }
    const origins=new Set(selected.map(row=>row.selection.origin));
    if(seriesOverride&&series!==recommendedSeries)return {...selectedData,validationStatus:'Review Required',status:`Review Required — ${series} differs from recommended ${recommendedSeries}`};
    if(origins.size>1)return {...selectedData,validationStatus:'Review Required',status:'Review Required — mixed indoor origins'};
    const validationStatus=manualOverride?'Manual Override':'Auto Selected';
    return {...selectedData,validationStatus,status:`${validationStatus} — verify engineering design`};
  }
  function refnets(systems, rows) {
    const output = [];
    const grouped=new Map();
    rows.forEach(row=>{const name=String(row.system||'').trim();if(!grouped.has(name))grouped.set(name,[]);grouped.get(name).push(row);});
    for (const system of systems) {
      const indoor = (grouped.get(system.system)||[]).filter(row => row.selection?.status === 'Selected');
      if (!system.combo || !['Auto Selected','Manual Override','Review Required'].includes(system.validationStatus) || indoor.length !== system.count) continue;
      const family = catalog.refnet[system.series];
      if (!family || indoor.length < 2) continue;
      const material = new Map();
      const add = (kit,description) => {
        for (const part of String(kit || '').split(/\s*\+\s*/).filter(Boolean)) {
          const entry=material.get(part)||{qty:0,descriptions:new Set()};entry.qty++;entry.descriptions.add(description);material.set(part,entry);
        }
      };
      const lookup = (entries,value) => [...entries].reverse().find(item => value >= item.from);
      const first = lookup(family.first,numeric(system.combo.hp));
      if (!first) { output.push({ system:system.system, status:'REFNET lookup unavailable for outdoor HP' }); continue; }
      add(first.model,`First branch from ${first.from} HP`);
      for (let i=1;i<indoor.length-1;i++) {
        const downstream = indoor.slice(i).reduce((sum,row)=>sum+numeric(row.selection.index),0);
        const kit = lookup(family.downstream,downstream);
        if (!kit) { output.push({ system:system.system, status:'REFNET lookup unavailable for downstream index' }); continue; }
        add(kit.model,`Downstream index from ${kit.from}`);
      }
      for (const [model,entry] of material) output.push({system:system.system,series:system.series,hp:system.combo.hp,model,qty:entry.qty,description:[...entry.descriptions].join('; '),status:'Preliminary'});
    }
    return output;
  }
  function calculate(manual) {
    if (!catalog) return manual;
    manual.indoor.forEach(row => row.selection = selectIndoor(row,manual.settings));
    const grouped=new Map();
    manual.indoor.forEach(row=>{const name=String(row.system||'').trim();if(!name)return;if(!grouped.has(name))grouped.set(name,[]);grouped.get(name).push(row);});
    const names = [...new Set([...manual.systems, ...grouped.keys()])];
    manual.systems = names;
    const previous=new Map(manual.outdoor.map(row=>[row.system,row]));
    manual.outdoor = names.map(name => selectOutdoor(name,grouped.get(name)||[],manual.settings,previous.get(name)));
    manual.refnets = refnets(manual.outdoor,manual.indoor);
    return manual;
  }
  return {load, get catalog(){return catalog;}, types, origins, calculate, eligibleCombos, comboId};
})();
