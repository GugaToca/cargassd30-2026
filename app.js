import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ---------- INIT ----------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- HELPERS ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function esc(str=""){
  return String(str).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function todayISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function toCSV(rows){
  const sep = ";";
  return rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(sep)).join("\n");
}

function downloadText(filename, content, mime="text/plain"){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- UI REFS ----------
const authView = $("#authView");
const appView = $("#appView");

const userBadge = $("#userBadge");
const btnLogout = $("#btnLogout");

const loginEmail = $("#loginEmail");
const loginPass = $("#loginPass");
const btnLogin = $("#btnLogin");
const btnRegister = $("#btnRegister");
const authMsg = $("#authMsg");

const yearEl = $("#year");

// Transportadoras
const tNome = $("#tNome");
const tCodigo = $("#tCodigo");
const tContato = $("#tContato");
const btnAddTransportadora = $("#btnAddTransportadora");
const tMsg = $("#tMsg");
const tSearch = $("#tSearch");
const transportadorasList = $("#transportadorasList");

// Cargas
const cTransportadora = $("#cTransportadora");
const cData = $("#cData");
const cPlaca = $("#cPlaca");
const cMotorista = $("#cMotorista");
const cProblema = $("#cProblema");
const cObs = $("#cObs");
const btnAddCarga = $("#btnAddCarga");
const cMsg = $("#cMsg");

const btnRefreshCargas = $("#btnRefreshCargas");
const fStatus = $("#fStatus");
const fTransportadora = $("#fTransportadora");
const fBusca = $("#fBusca");
const cargasList = $("#cargasList");

// Detail
const cargaDetailWrap = $("#cargaDetail");
const detailEmpty = $("#detailEmpty");
const detailResumo = $("#detailResumo");
const btnCloseDetail = $("#btnCloseDetail");
const btnDeleteCarga = $("#btnDeleteCarga");
const btnToggleProblema = $("#btnToggleProblema");
const btnEditObs = $("#btnEditObs");

// Pedidos
const pNumero = $("#pNumero");
const pCliente = $("#pCliente");
const pVolumes = $("#pVolumes");
const pObs = $("#pObs");
const btnAddPedido = $("#btnAddPedido");
const pMsg = $("#pMsg");
const pedidosList = $("#pedidosList");

// Dashboard
const kpiTotal = $("#kpiTotal");
const kpiOk = $("#kpiOk");
const kpiErr = $("#kpiErr");
const dashLastCargas = $("#dashLastCargas");
const dashTransportadoras = $("#dashTransportadoras");
const dashErros = $("#dashErros");

// Relatórios
const rDe = $("#rDe");
const rAte = $("#rAte");
const btnGerarRelatorio = $("#btnGerarRelatorio");
const btnExportCSV = $("#btnExportCSV");
const relatorioResumo = $("#relatorioResumo");
const relatorioTabela = $("#relatorioTabela");

// Tabs
const navItems = $$(".navItem");
const tabs = $$(".tab");

// ---------- STATE ----------
let currentUser = null;
let cacheTransportadoras = [];
let cacheCargas = [];
let selectedCargaId = null;
let lastReportRows = []; // para export CSV

// ---------- AUTH ----------
btnLogin.addEventListener("click", async () => {
  authMsg.textContent = "";
  try{
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPass.value);
  }catch(e){
    authMsg.textContent = "Erro ao entrar: " + (e?.message || e);
  }
});

btnRegister.addEventListener("click", async () => {
  authMsg.textContent = "";
  try{
    await createUserWithEmailAndPassword(auth, loginEmail.value.trim(), loginPass.value);
  }catch(e){
    authMsg.textContent = "Erro ao criar conta: " + (e?.message || e);
  }
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;

  if(!currentUser){
    authView.classList.remove("hidden");
    appView.classList.add("hidden");
    userBadge.classList.add("hidden");
    btnLogout.classList.add("hidden");
    return;
  }

  authView.classList.add("hidden");
  appView.classList.remove("hidden");

  userBadge.textContent = currentUser.email;
  userBadge.classList.remove("hidden");
  btnLogout.classList.remove("hidden");

  // defaults
  yearEl.textContent = new Date().getFullYear();
  cData.value = todayISO();

  // load data
  await loadTransportadoras();
  await loadCargas();
  await renderDashboard();
});

// ---------- NAV ----------
navItems.forEach(btn => {
  btn.addEventListener("click", () => {
    navItems.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    tabs.forEach(t => t.classList.add("hidden"));
    $(`#tab-${tab}`).classList.remove("hidden");
  });
});

// ---------- FIRESTORE REFS ----------
const colTransportadoras = () => collection(db, "transportadoras");
const colCargas = () => collection(db, "cargas");
const colPedidos = (cargaId) => collection(db, "cargas", cargaId, "pedidos");

// ---------- TRANSPORTADORAS ----------
btnAddTransportadora.addEventListener("click", async () => {
  tMsg.textContent = "";
  const nome = tNome.value.trim();
  if(!nome){
    tMsg.textContent = "Informe o nome.";
    return;
  }

  const payload = {
    nome,
    codigo: tCodigo.value.trim(),
    contato: tContato.value.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try{
    await addDoc(colTransportadoras(), payload);
    tNome.value = ""; tCodigo.value = ""; tContato.value = "";
    tMsg.textContent = "Salvo ✅";
    await loadTransportadoras();
    await renderDashboard();
  }catch(e){
    tMsg.textContent = "Erro: " + (e?.message || e);
  }
});

tSearch.addEventListener("input", () => renderTransportadorasTable());

async function loadTransportadoras(){
  const qy = query(colTransportadoras(), orderBy("nome"));
  const snap = await getDocs(qy);
  cacheTransportadoras = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  fillTransportadoraSelects();
  renderTransportadorasTable();
}

function fillTransportadoraSelects(){
  const options = cacheTransportadoras.map(t => `<option value="${t.id}">${esc(t.nome)}${t.codigo ? " • " + esc(t.codigo) : ""}</option>`).join("");
  cTransportadora.innerHTML = `<option value="">Selecione...</option>${options}`;

  // filtro
  fTransportadora.innerHTML = `<option value="TODAS">Todas</option>${options}`;
}

function renderTransportadorasTable(){
  const term = (tSearch.value || "").trim().toLowerCase();
  const rows = cacheTransportadoras
    .filter(t => {
      if(!term) return true;
      return (t.nome||"").toLowerCase().includes(term)
        || (t.codigo||"").toLowerCase().includes(term)
        || (t.contato||"").toLowerCase().includes(term);
    })
    .map(t => `
      <tr>
        <td><strong>${esc(t.nome)}</strong><div class="muted small">${esc(t.codigo||"")}</div></td>
        <td>${esc(t.contato||"—")}</td>
        <td>
          <div class="actions">
            <button class="btn btnGhost" data-act="editT" data-id="${t.id}">Editar</button>
            <button class="btn btnDanger" data-act="delT" data-id="${t.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `).join("");

  transportadorasList.innerHTML = `
    <table>
      <thead>
        <tr><th>Transportadora</th><th>Contato</th><th>Ações</th></tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="3" class="muted">Nenhuma transportadora.</td></tr>`}
      </tbody>
    </table>
  `;

  transportadorasList.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      const item = cacheTransportadoras.find(x => x.id === id);
      if(!item) return;

      if(act === "delT"){
        if(!confirm(`Excluir transportadora "${item.nome}"?`)) return;
        await deleteDoc(doc(db, "transportadoras", id));
        await loadTransportadoras();
        await renderDashboard();
      }

      if(act === "editT"){
        const novoNome = prompt("Nome:", item.nome);
        if(novoNome === null) return;
        const novoCodigo = prompt("Código:", item.codigo || "");
        if(novoCodigo === null) return;
        const novoContato = prompt("Contato:", item.contato || "");
        if(novoContato === null) return;

        await updateDoc(doc(db, "transportadoras", id), {
          nome: novoNome.trim(),
          codigo: novoCodigo.trim(),
          contato: novoContato.trim(),
          updatedAt: serverTimestamp()
        });

        await loadTransportadoras();
        await renderDashboard();
      }
    });
  });
}

// ---------- CARGAS ----------
btnAddCarga.addEventListener("click", async () => {
  cMsg.textContent = "";

  const transportadoraId = cTransportadora.value;
  if(!transportadoraId){
    cMsg.textContent = "Selecione uma transportadora.";
    return;
  }

  const t = cacheTransportadoras.find(x => x.id === transportadoraId);
  const dataDespacho = cData.value || todayISO();

  const payload = {
    transportadoraId,
    transportadoraNome: t?.nome || "",
    dataDespacho,
    placa: cPlaca.value.trim(),
    motorista: cMotorista.value.trim(),
    problema: cProblema.value,
    observacao: cObs.value.trim(),
    totalPedidos: 0,
    totalVolumes: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try{
    const ref = await addDoc(colCargas(), payload);
    cPlaca.value = ""; cMotorista.value = ""; cObs.value = ""; cProblema.value = "OK";
    cMsg.textContent = "Carga criada ✅";
    await loadCargas();
    await renderDashboard();
    await openCargaDetail(ref.id);
  }catch(e){
    cMsg.textContent = "Erro: " + (e?.message || e);
  }
});

btnRefreshCargas.addEventListener("click", async () => {
  await loadCargas();
  await renderDashboard();
});

[fStatus, fTransportadora, fBusca].forEach(el => el.addEventListener("input", () => renderCargasTable()));

async function loadCargas(){
  // Carrega últimas 300 (pra MVP). Depois a gente pagina e melhora.
  const qy = query(colCargas(), orderBy("dataDespacho","desc"), limit(300));
  const snap = await getDocs(qy);
  cacheCargas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderCargasTable();
}

function renderCargasTable(){
  const st = fStatus.value;
  const tr = fTransportadora.value;
  const term = (fBusca.value || "").trim().toLowerCase();

  const filtered = cacheCargas.filter(c => {
    if(st !== "TODOS" && c.problema !== st) return false;
    if(tr !== "TODAS" && c.transportadoraId !== tr) return false;

    if(term){
      const blob = `${c.placa||""} ${c.motorista||""} ${c.observacao||""} ${c.transportadoraNome||""} ${c.dataDespacho||""}`.toLowerCase();
      if(!blob.includes(term)) return false;
    }
    return true;
  });

  const cards = filtered.map(c => {
    const statusClass = c.problema === "OK" ? "ok" : "err";
    const obs = (c.observacao || "").trim();

    return `
      <div class="cargaCard" data-id="${c.id}">
        <div class="cargaTop">
          <div class="cargaTitle">
            <strong>${esc(c.dataDespacho || "—")}</strong>
            <small title="${esc(c.transportadoraNome || "")}">${esc(c.transportadoraNome || "—")}</small>
          </div>

          <div class="cargaMeta">
            <span class="tag ${statusClass}">${esc(c.problema)}</span>
            <span class="badge">${Number(c.totalPedidos||0)} pedidos</span>
          </div>
        </div>

        <div class="cargaInfo">
          <div class="kpiBox">
            <div class="k">Placa</div>
            <div class="v">${esc(c.placa || "—")}</div>
            <div class="muted small">${esc(c.motorista || "")}</div>
          </div>

          <div class="kpiBox">
            <div class="k">Volumes</div>
            <div class="v">${Number(c.totalVolumes||0)}</div>
            <div class="muted small">Total na carga</div>
          </div>
        </div>

        <div class="cargaObs">
          ${obs ? esc(obs) : "Sem observação."}
        </div>

        <div class="cargaFooter">
          <button class="btn btnGhost btnMini" data-act="toggleStatus" data-id="${c.id}">
            Alternar OK/ERRO
          </button>
          <button class="btn btnMini" data-act="openC" data-id="${c.id}">
            Abrir
          </button>
        </div>
      </div>
    `;
  }).join("");

  cargasList.innerHTML = `
    <div class="cargaGrid">
      ${cards || `<div class="muted">Nenhuma carga encontrada.</div>`}
    </div>
  `;

  // eventos
  cargasList.querySelectorAll("button[data-act='openC']").forEach(btn => {
    btn.addEventListener("click", () => openCargaDetail(btn.dataset.id));
  });

  cargasList.querySelectorAll("button[data-act='toggleStatus']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const item = cacheCargas.find(x => x.id === id);
      if(!item) return;

      const next = item.problema === "OK" ? "ERRO" : "OK";
      await updateDoc(doc(db, "cargas", id), {
        problema: next,
        updatedAt: serverTimestamp()
      });

      await loadCargas();
      await renderDashboard();
      // mantém no tab e refaz cards
      renderCargasTable();
    });
  });
}


// ---------- DETAIL ----------
btnCloseDetail.addEventListener("click", () => closeDetail());

btnDeleteCarga.addEventListener("click", async () => {
  if(!selectedCargaId) return;
  const item = cacheCargas.find(x => x.id === selectedCargaId);
  if(!confirm(`Excluir a carga de ${item?.dataDespacho || ""} (${item?.transportadoraNome || ""})?`)) return;

  // MVP: não remove subcoleção automaticamente (Firestore não tem cascade nativo).
  // A gente evita dor de cabeça: avisa o usuário.
  alert("Atenção: pedidos (subcoleção) não são removidos automaticamente neste MVP. Para remover tudo, use uma Cloud Function depois.");

  await deleteDoc(doc(db, "cargas", selectedCargaId));
  selectedCargaId = null;
  await loadCargas();
  await renderDashboard();
  closeDetail();
});

btnToggleProblema.addEventListener("click", async () => {
  if(!selectedCargaId) return;
  const item = cacheCargas.find(x => x.id === selectedCargaId);
  if(!item) return;

  const next = item.problema === "OK" ? "ERRO" : "OK";
  await updateDoc(doc(db, "cargas", selectedCargaId), {
    problema: next,
    updatedAt: serverTimestamp()
  });

  await loadCargas();
  await renderDashboard();
  await openCargaDetail(selectedCargaId);
});

btnEditObs.addEventListener("click", async () => {
  if(!selectedCargaId) return;
  const item = cacheCargas.find(x => x.id === selectedCargaId);
  const obs = prompt("Observação:", item?.observacao || "");
  if(obs === null) return;

  await updateDoc(doc(db, "cargas", selectedCargaId), {
    observacao: obs.trim(),
    updatedAt: serverTimestamp()
  });

  await loadCargas();
  await renderDashboard();
  await openCargaDetail(selectedCargaId);
});

async function openCargaDetail(cargaId){
  selectedCargaId = cargaId;

  detailEmpty.classList.add("hidden");
  cargaDetailWrap.classList.remove("hidden");
  btnDeleteCarga.classList.remove("hidden");

  const c = cacheCargas.find(x => x.id === cargaId);
  if(!c){
    // se não estiver no cache, busca
    const snap = await getDoc(doc(db, "cargas", cargaId));
    if(!snap.exists()) return;
  }

  renderDetailResumo();
  await loadPedidos();
}

function closeDetail(){
  selectedCargaId = null;
  cargaDetailWrap.classList.add("hidden");
  btnDeleteCarga.classList.add("hidden");
  detailEmpty.classList.remove("hidden");
  pedidosList.innerHTML = "";
  pMsg.textContent = "";
  pNumero.value = ""; pCliente.value = ""; pVolumes.value = ""; pObs.value = "";
}

function renderDetailResumo(){
  const c = cacheCargas.find(x => x.id === selectedCargaId);
  if(!c) return;

  detailResumo.innerHTML = `
    <div>Data</div><div>${esc(c.dataDespacho || "—")}</div>
    <div>Transportadora</div><div>${esc(c.transportadoraNome || "—")}</div>
    <div>Placa</div><div>${esc(c.placa || "—")}</div>
    <div>Motorista</div><div>${esc(c.motorista || "—")}</div>
    <div>Status</div><div><span class="tag ${c.problema==="OK"?"ok":"err"}">${esc(c.problema)}</span></div>
    <div>Obs</div><div>${esc(c.observacao || "—")}</div>
    <div>Pedidos</div><div>${Number(c.totalPedidos||0)}</div>
    <div>Volumes</div><div>${Number(c.totalVolumes||0)}</div>
  `;
}

// ---------- PEDIDOS ----------
btnAddPedido.addEventListener("click", async () => {
  pMsg.textContent = "";
  if(!selectedCargaId){
    pMsg.textContent = "Selecione uma carga.";
    return;
  }

  const numero = pNumero.value.trim();
  if(!numero){
    pMsg.textContent = "Informe o nº do pedido.";
    return;
  }

  const volumes = Number(pVolumes.value || 0);
  if(volumes < 0 || Number.isNaN(volumes)){
    pMsg.textContent = "Volumes inválido.";
    return;
  }

  const payload = {
    numero,
    cliente: pCliente.value.trim(),
    volumes,
    observacao: pObs.value.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try{
    await addDoc(colPedidos(selectedCargaId), payload);
    pNumero.value = ""; pCliente.value = ""; pVolumes.value = ""; pObs.value = "";
    pMsg.textContent = "Pedido adicionado ✅";
    await recalcCargaTotals(selectedCargaId);
    await loadCargas();
    await renderDashboard();
    await openCargaDetail(selectedCargaId);
  }catch(e){
    pMsg.textContent = "Erro: " + (e?.message || e);
  }
});

async function loadPedidos(){
  if(!selectedCargaId) return;
  const qy = query(colPedidos(selectedCargaId), orderBy("createdAt","desc"), limit(500));
  const snap = await getDocs(qy);
  const pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const rows = pedidos.map(p => `
    <tr>
      <td><strong>${esc(p.numero)}</strong><div class="muted small">${esc(p.cliente||"")}</div></td>
      <td>${Number(p.volumes||0)}</td>
      <td>${esc(p.observacao||"—")}</td>
      <td>
        <div class="actions">
          <button class="btn btnGhost" data-act="editP" data-id="${p.id}">Editar</button>
          <button class="btn btnDanger" data-act="delP" data-id="${p.id}">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");

  pedidosList.innerHTML = `
    <table>
      <thead>
        <tr><th>Pedido</th><th>Volumes</th><th>Obs</th><th>Ações</th></tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="4" class="muted">Nenhum pedido.</td></tr>`}
      </tbody>
    </table>
  `;

  pedidosList.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const act = btn.dataset.act;
      const pid = btn.dataset.id;

      if(act === "delP"){
        if(!confirm("Excluir pedido?")) return;
        await deleteDoc(doc(db, "cargas", selectedCargaId, "pedidos", pid));
        await recalcCargaTotals(selectedCargaId);
        await loadCargas();
        await renderDashboard();
        await openCargaDetail(selectedCargaId);
      }

      if(act === "editP"){
        const snapP = await getDoc(doc(db, "cargas", selectedCargaId, "pedidos", pid));
        if(!snapP.exists()) return;
        const p = snapP.data();

        const nNumero = prompt("Nº do pedido:", p.numero || "");
        if(nNumero === null) return;
        const nCliente = prompt("Cliente:", p.cliente || "");
        if(nCliente === null) return;
        const nVolumes = prompt("Volumes:", String(p.volumes ?? 0));
        if(nVolumes === null) return;
        const nObs = prompt("Obs:", p.observacao || "");
        if(nObs === null) return;

        await updateDoc(doc(db, "cargas", selectedCargaId, "pedidos", pid), {
          numero: nNumero.trim(),
          cliente: nCliente.trim(),
          volumes: Number(nVolumes || 0),
          observacao: nObs.trim(),
          updatedAt: serverTimestamp()
        });

        await recalcCargaTotals(selectedCargaId);
        await loadCargas();
        await renderDashboard();
        await openCargaDetail(selectedCargaId);
      }
    });
  });
}

async function recalcCargaTotals(cargaId){
  const snap = await getDocs(query(colPedidos(cargaId), limit(1000)));
  let totalPedidos = 0;
  let totalVolumes = 0;

  snap.forEach(d => {
    totalPedidos += 1;
    totalVolumes += Number(d.data().volumes || 0);
  });

  await updateDoc(doc(db, "cargas", cargaId), {
    totalPedidos,
    totalVolumes,
    updatedAt: serverTimestamp()
  });
}

// ---------- DASHBOARD ----------
async function renderDashboard(){
  // KPIs usando cacheCargas
  const total = cacheCargas.length;
  const ok = cacheCargas.filter(c => c.problema === "OK").length;
  const err = cacheCargas.filter(c => c.problema === "ERRO").length;

  kpiTotal.textContent = `Total: ${total}`;
  kpiOk.textContent = `OK: ${ok}`;
  kpiErr.textContent = `ERRO: ${err}`;

  // últimas cargas
  const last = cacheCargas.slice(0, 6);
  dashLastCargas.innerHTML = last.map(c => `
    <div class="item">
      <strong>${esc(c.dataDespacho || "—")} • ${esc(c.transportadoraNome || "")}</strong>
      <small>${esc(c.placa||"—")} • ${esc(c.motorista||"")}</small>
      <small><span class="tag ${c.problema==="OK"?"ok":"err"}">${esc(c.problema)}</span> • ${esc(c.observacao||"")}</small>
    </div>
  `).join("") || `<div class="muted small">Sem cargas.</div>`;

  // transportadoras
  dashTransportadoras.innerHTML = cacheTransportadoras.slice(0, 8).map(t => `
    <div class="item">
      <strong>${esc(t.nome)}</strong>
      <small>${esc(t.codigo||"")}</small>
      <small>${esc(t.contato||"")}</small>
    </div>
  `).join("") || `<div class="muted small">Sem transportadoras.</div>`;

  // erros
  const errs = cacheCargas.filter(c => c.problema === "ERRO").slice(0, 6);
  dashErros.innerHTML = errs.map(c => `
    <div class="item">
      <strong>${esc(c.dataDespacho || "—")} • ${esc(c.transportadoraNome||"")}</strong>
      <small>${esc(c.observacao || "Sem observação")}</small>
    </div>
  `).join("") || `<div class="muted small">Nenhum ERRO 🎉</div>`;
}

// ---------- RELATÓRIOS ----------
btnGerarRelatorio.addEventListener("click", async () => {
  const de = rDe.value;
  const ate = rAte.value;

  if(!de || !ate){
    relatorioResumo.textContent = "Informe um período (De/Até).";
    relatorioTabela.innerHTML = "";
    btnExportCSV.classList.add("hidden");
    return;
  }

  const list = cacheCargas.filter(c => (c.dataDespacho || "") >= de && (c.dataDespacho || "") <= ate);

  const total = list.length;
  const ok = list.filter(c => c.problema === "OK").length;
  const err = list.filter(c => c.problema === "ERRO").length;
  const volumes = list.reduce((acc, c) => acc + Number(c.totalVolumes||0), 0);
  const pedidos = list.reduce((acc, c) => acc + Number(c.totalPedidos||0), 0);

  relatorioResumo.textContent = `Período ${de} até ${ate} • Cargas: ${total} • OK: ${ok} • ERRO: ${err} • Pedidos: ${pedidos} • Volumes: ${volumes}`;

  const rows = list.map(c => ([
    c.dataDespacho || "",
    c.transportadoraNome || "",
    c.placa || "",
    c.motorista || "",
    c.problema || "",
    c.observacao || "",
    Number(c.totalPedidos||0),
    Number(c.totalVolumes||0)
  ]));

  lastReportRows = rows;

  const htmlRows = rows.map(r => `
    <tr>
      <td>${esc(r[0])}</td>
      <td>${esc(r[1])}</td>
      <td>${esc(r[2])}</td>
      <td>${esc(r[3])}</td>
      <td><span class="tag ${r[4]==="OK"?"ok":"err"}">${esc(r[4])}</span></td>
      <td>${esc(r[5])}</td>
      <td>${esc(r[6])}</td>
      <td>${esc(r[7])}</td>
    </tr>
  `).join("");

  relatorioTabela.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Data</th><th>Transportadora</th><th>Placa</th><th>Motorista</th>
          <th>Status</th><th>Obs</th><th>Pedidos</th><th>Volumes</th>
        </tr>
      </thead>
      <tbody>
        ${htmlRows || `<tr><td colspan="8" class="muted">Sem dados no período.</td></tr>`}
      </tbody>
    </table>
  `;

  btnExportCSV.classList.toggle("hidden", rows.length === 0);
});

btnExportCSV.addEventListener("click", () => {
  const header = [["Data","Transportadora","Placa","Motorista","Status","Obs","Pedidos","Volumes"]];
  const csv = toCSV(header.concat(lastReportRows));
  downloadText(`relatorio-cargas.csv`, csv, "text/csv;charset=utf-8");
});

// ---------- DEFAULTS ----------
(function initDefaults(){
  yearEl.textContent = new Date().getFullYear();
  rDe.value = todayISO();
  rAte.value = todayISO();
})();
