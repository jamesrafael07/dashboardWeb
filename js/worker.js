self.onmessage = function (e) {
  try {
    const { rows } = e.data;
    if (!rows || rows.length === 0) throw new Error("Hoja vacía");
    
     // Detectamos si es el Excel de Saldos buscando "META2" en las primeras 10 filas
    let isSaldos = false;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      if (rows[i] && rows[i].some(c => c && c.toString().toUpperCase().includes("META2"))) {
        isSaldos = true; break;
      }
    }
    
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
  // Busca la cabecera dinámicamente (donde diga META2)
  let hIdx = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].some(cell => cell && cell.toString().toUpperCase().includes("META2"))) {
      hIdx = i; break;
    }
  }
  
  const headers = (rows[hIdx] || []).map(h => (h || "").toString().trim().toUpperCase());
  
  const cMeta2 = headers.findIndex(h => h.includes("META2"));  
  const cClasif = headers.findIndex(h => h.includes("CLAS GASTO DET"));
    // Diccionario de Metas a Oficinas (basado en tu imagen)
  const diccOficinas = {
    "31": "OA - OFICINA DE ADMINISTRACION",
    "32": "OA - UA - UNIDAD DE ABASTECIMIENTO",
    "35": "OA - UACGD - UNIDAD E ATENCION AL CIUDADANO Y GESTION DOCUMENTAL",
    "40-41": "OA - UEI - UNIDAD EJECUTORA DE INVERSIONES",
    "26": "OA - UFCyT - UNIDAD DE FINANZAS, CONTABILIDAD Y TESORERIA",
    "28": "OA - URH - UNIDAD DE RECURSOS HUMANOS",
    "30": "OA - URH - UNIDAD DE RECURSOS HUMANOS"
  };
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

if (!colB) continue;
    if (colA.toUpperCase().startsWith("TOTAL") || colB.toUpperCase().startsWith("TOTAL")) continue;

if (colA) {
  // Si el número está en el diccionario, usa el nombre de la oficina. Si no, deja el número.
  currentMeta = diccOficinas[colA] || colA;
}if (colA) currentMeta = colA;
if (!colB) continue;
if (!currentMeta) continue; // Ignora solo si no hay meta actual

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
    
    // Extraemos el código de GEN GASTO
    let genGasto = "SIN CATEGORÍA";
    const matchGen = colB.match(/^(\d+\.\d+)/);
    if (matchGen) {
      genGasto = matchGen[1];
      // Diccionario para cambiar el número por el nombre
      const nombresGen = {
        "2.1": "2.1 - PERSONAL Y OBLIGACIONES SOCIALES",
        "2.3": "2.3 - BIENES Y SERVICIOS",
        "2.4": "2.4 - DONACIONES Y TRANSFERENCIAS",
        "2.5": "2.5 - OTROS GASTOS",
        "2.6": "2.6 - ADQUISICION DE ACTIVOS NO FINANCIEROS"
      };
      if (nombresGen[genGasto]) {
        genGasto = nombresGen[genGasto];
      }
    }

    filas.push({ 
      meta: currentMeta, 
      clasif: colB, 
      genGasto, // <-- Agrega esto
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