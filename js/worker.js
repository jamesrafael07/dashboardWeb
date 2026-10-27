self.onmessage = function (e) {
  try {
    const { rows } = e.data;
    if (!rows || rows.length === 0) throw new Error("Hoja vacía");
    
    // Detectamos si es el Excel de Saldos buscando "META2"
    const isSaldos = rows[0] && rows[0].some(c => c && c.toString().toUpperCase().includes("META2"));
    
    const resultado = isSaldos ? procesarSaldos(rows) : procesarSANIPES(rows);
    self.postMessage({ ok: true, resultado });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ""; }
function num(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === "") return 0;
  const s = v.toString().replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

// ==========================================
// LÓGICA NUEVA: SOLO PARA SALDOS
// ==========================================
function procesarSaldos(rows) {
  let hIdx = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].some(cell => cell && cell.toString().toUpperCase().includes("META2"))) {
      hIdx = i; break;
    }
  }
  const headers = (rows[hIdx] || []).map(h => (h || "").toString().trim().toUpperCase());
  
  const cMeta2 = headers.findIndex(h => h.includes("META2"));
  const cClasif = headers.findIndex(h => h.includes("CLASIFICADOR"));
  const cPia = headers.findIndex(h => h.includes("PIA"));
  const cPim = headers.findIndex(h => h.includes("PIM"));
  const cCert = headers.findIndex(h => h.includes("CERT"));
  const cCAnual = headers.findIndex(h => h.includes("CANUAL"));
  const cComp = headers.findIndex(h => h.includes("COMP") && !h.includes("CANUAL"));
  const cDev = headers.findIndex(h => h.includes("DEVENGADO"));
  const cGiro = headers.findIndex(h => h.includes("GIRO"));
  const cPago = headers.findIndex(h => h.includes("PAGO"));
  const cSaldo = headers.findIndex(h => h.includes("SALDO"));

  const filas = [];
  const porMeta = {};
  let tPim = 0, tSaldo = 0;
  let currentMeta = "SIN META";

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const colA = norm(r[cMeta2]);
    const colB = norm(r[cClasif]);

    if (colA.toUpperCase().includes("TOTAL") || colB.toUpperCase().includes("TOTAL")) continue;
    if (colA) currentMeta = colA;
    if (!colB) continue;

    // Capturamos TODOS los montos
    const pia = num(r[cPia]);
    const pim = num(r[cPim]);
    const cert = num(r[cCert]);
    const cAnual = num(r[cCAnual]);
    const comp = num(r[cComp]);
    const dev = num(r[cDev]);
    const giro = num(r[cGiro]);
    const pago = num(r[cPago]);
    const saldo = num(r[cSaldo]);

    tPim += pim;
    tSaldo += saldo;
    porMeta[currentMeta] = (porMeta[currentMeta] || 0) + saldo;

    filas.push({ 
      meta: currentMeta, 
      clasif: colB, 
      pia, pim, cert, cAnual, comp, dev, giro, pago, saldo 
    });
  }

  return {
    kpis: { tPim, tSaldo, pctSaldo: tPim ? (tSaldo / tPim) * 100 : 0 },
    porMeta: Object.entries(porMeta).map(([k, v]) => ({ nombre: `Meta ${k}`, valor: v })).sort((a, b) => b.valor - a.valor),
    filas
  };
}

// ==========================================
// LÓGICA ORIGINAL: SANIPES (Evolución/Seguimiento)
// (No se tocó absolutamente nada aquí)
// ==========================================
function procesarSANIPES(rows) {
  let hIdx = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].some(cell => cell && cell.toString().toUpperCase().includes("OFICINA"))) {
      hIdx = i;
      break;
    }
  }
  const headers = (rows[hIdx] || []).map(h => (h || "").toString().trim().toUpperCase());
  
  const cOfi = headers.findIndex(h => h.includes("OFICINA") && !h.includes("META"));
  const cDep = headers.findIndex(h => h.includes("DEPENDENCIA"));
  const cMetaOficina = headers.findIndex(h => h.includes("META") && h.includes("OFICINA"));
  const cGen = headers.findIndex(h => h === "GEN" || h.includes("GEN"));
  const cEsp = headers.findIndex(h => h.includes("ESP GASTO"));
  
  const cPim = headers.findIndex(h => h.includes("PIM") && h.includes("(C)"));
  const cCert = headers.findIndex(h => h.includes("CERTIFICADO") && h.includes("(D)"));
  const cCompAnual = headers.findIndex(h => h.includes("COMPROMISO ANUAL"));
  const cComp = headers.findIndex(h => h.includes("COMPROMISO") && !h.includes("ANUAL"));
  const cDev = headers.findIndex(h => h.includes("DEVENGADO") && h.includes("(G)"));
  const cSaldoCert = headers.findIndex(h => h.includes("SALDO") && h.includes("PIM - CERTIFICADO"));
  
  const cProgOct = headers.findIndex(h => h.includes("DEV PROY 10-OCT"));
  const cDevOct = headers.findIndex(h => h.includes("DEV 10-OCT"));
  const cProgNov = headers.findIndex(h => h.includes("DEV PROY 11-NOV"));
  const cProgDic = headers.findIndex(h => h.includes("DEV PROY 12-DIC"));
  
  const cMeses = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SET","OCT","NOV","DIC"].map(m => 
    headers.findIndex(h => h.includes("DEV ") && h.includes(m) && !h.includes("PROY"))
  );

  const filas = [];
  const porMes = MESES.map(m => ({ mes: m, valor: 0 }));
  const porEspGasto = {}; 

  let tPim = 0, tCert = 0, tCompAnual = 0, tComp = 0, tDev = 0;
  let tSaldoCert = 0, tProgOct = 0, tDevOct = 0, tProgNov = 0, tProgDic = 0;

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;

    let ofi = norm(r[cOfi]); 
    if (ofi.match(/^[\d\.\-]+/)) {
      ofi = ofi.replace(/^[\d\.\-]+/, "").trim();
    }

    const filaTexto = r.join(' ').toUpperCase(); 

    if (!ofi || ofi.toUpperCase().includes("TOTAL") || filaTexto.includes("TOTAL GENERAL") || filaTexto.startsWith("* *")) {
      continue; 
    }

    let dep = norm(r[cDep]) || "SIN DEPENDENCIA";
    if (dep.match(/^[\d\.\-]+/)) {
      dep = dep.replace(/^[\d\.\-]+/, "").trim();
    }

    let meta = norm(r[cMetaOficina]) || "SIN META";
    let gen = norm(r[cGen]) || "SIN ESPECÍFICA";
    let esp = norm(r[cEsp]) || "SIN ESPECÍFICA";

    const pim = num(r[cPim]);
    const cert = num(r[cCert]);
    const compAnual = num(r[cCompAnual]);
    const comp = num(r[cComp]);
    const dev = num(r[cDev]);
    const saldoCert = num(r[cSaldoCert]);
    const progOct = num(r[cProgOct]);
    const devOct = num(r[cDevOct]);
    const progNov = num(r[cProgNov]);
    const progDic = num(r[cProgDic]);
    
    const difOct = progOct - devOct;
    const difAnual = pim - dev - progNov - progDic;
    const pctEjeOct = pim ? (devOct / pim) * 100 : 0;

    tPim += pim; tCert += cert; tCompAnual += compAnual; tComp += comp; tDev += dev;
    tSaldoCert += saldoCert; tProgOct += progOct; tDevOct += devOct; tProgNov += progNov; tProgDic += progDic;

    if (gen && dev > 0) porEspGasto[gen] = (porEspGasto[gen] || 0) + dev;

    const devMesFila = new Array(12).fill(0);
    cMeses.forEach((col, mIdx) => {
      if (col >= 0) {
        const v = num(r[col]);
        devMesFila[mIdx] = v;
        if (v > 0) porMes[mIdx].valor += v;
      }
    });

    filas.push({ 
      ofi, dep, meta, gen, esp, pim, cert, compAnual, comp, dev, 
      saldoCert, progOct, devOct, progNov, progDic, difOct, difAnual, pctEjeOct,
      devMes: devMesFila 
    });
  }

  return {
    kpis: { tPim, tCert, tCompAnual, tComp, tDev, tSaldoCert, tProgOct, tDevOct, tProgNov, tProgDic },
    porEspGasto: Object.entries(porEspGasto).map(([k, v]) => ({ nombre: k, valor: v })).sort((a, b) => b.valor - a.valor),
    porMes,
    filas
  };
}