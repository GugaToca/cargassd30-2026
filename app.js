let chartCargasDia = null;
let chartVolumesPedidos = null;

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { logout } from "./auth.js";

let currentUser = null;
let cargas = [];
let cargaEmEdicaoId = null;

const form = document.getElementById("carga-form");
const listEl = document.getElementById("cargas-list");
const filtroDataEl = document.getElementById("filtro-data");
const filtroBuscaEl = document.getElementById("filtro-busca");
const totalCargasEl = document.getElementById("total-cargas");
const totalVolumesEl = document.getElementById("total-volumes");
const totalPedidosEl = document.getElementById("total-pedidos");
const btnExportar = document.getElementById("btn-exportar");
const btnLimparFiltros = document.getElementById("btn-limpar-filtros");
const btnLogout = document.getElementById("logout-header");
const usuarioNomeEl = document.getElementById("usuario-nome");

// ===============================
// AUTH
// ===============================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  usuarioNomeEl.textContent = user.displayName || user.email;

  init();
});

// ===============================
// INIT
// ===============================
function init() {
  const hoje = new Date().toISOString().slice(0, 10);
  if (form && form.data) {
    form.data.value = hoje;
  }

  form.addEventListener("submit", handleSubmit);
  filtroDataEl.addEventListener("change", renderCargas);
  filtroBuscaEl.addEventListener("input", renderCargas);
  btnExportar.addEventListener("click", exportarPDF);
  btnLimparFiltros.addEventListener("click", (e) => {
    e.preventDefault();
    filtroDataEl.value = "";
    filtroBuscaEl.value = "";
    renderCargas();
  });

  btnLogout.addEventListener("click", async () => {
    await logout();
  });

  listEl.addEventListener("click", handleListClick);

  // botão gerar relatório
  const btnGerarRelatorio = document.getElementById("btn-gerar-relatorio");
  if (btnGerarRelatorio) {
    btnGerarRelatorio.onclick = gerarRelatorio;
  }

  carregarCargas();
}

// ===============================
// CARGAS
// ===============================
async function carregarCargas() {
  if (!currentUser) return;

  listEl.innerHTML = `<p class="info-text">Carregando cargas...</p>`;

  try {
    const ref = collection(db, "users", currentUser.uid, "cargas");
    const q = query(ref, orderBy("data", "desc"), orderBy("numeroCarga", "desc"));
    const snap = await getDocs(q);

    cargas = snap.docs.map((d) => ({
      id: d.id,
      ...d.data()
    }));

    renderCargas();
  } catch (err) {
    console.error(err);
    listEl.innerHTML = `<p class="error-text">Erro ao carregar cargas.</p>`;
  }
}

function getCargasFiltradas() {
  const dataFiltro = filtroDataEl.value;
  const busca = filtroBuscaEl.value.trim().toLowerCase();

  let filtradas = [...cargas];

  if (dataFiltro) {
    filtradas = filtradas.filter((c) => c.data === dataFiltro);
  }

  if (busca) {
    filtradas = filtradas.filter((c) => {
      const texto = [
        c.numeroCarga,
        c.transportadora,
        c.rota,
        c.carregador,
        c.observacoes
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return texto.includes(busca);
    });
  }

  return filtradas;
}

function renderCargas() {
  const filtradas = getCargasFiltradas();

  if (!filtradas.length) {
    listEl.innerHTML = `<p class="empty-state">Nenhuma carga encontrada com os filtros atuais.</p>`;
  } else {
    listEl.innerHTML = filtradas
      .map((c) => criarCardCarga(c))
      .join("");
  }

  atualizarResumo(filtradas);
}

function criarCardCarga(c) {
  const dataFormatada = formatarData(c.data);
  const situacao = c.situacao || "ok";
  const chipClass = situacao === "ok" ? "chip--ok" : "chip--problema";
  const chipLabel = situacao === "ok" ? "OK" : "Problema";

  const volumes = c.volumes || "-";
  const pedidos = c.pedidos || "-";
  const rota = c.rota || "-";
  const observacoes = c.observacoes || "-";

  return `
    <article class="carga-card" data-id="${c.id}">
      <header class="carga-header">
        <div>
          <span class="carga-numero">Carga ${escapeHtml(c.numeroCarga || "")}</span>
          <span class="carga-data">${dataFormatada}</span>
        </div>
        <span class="chip ${chipClass}">${chipLabel}</span>
      </header>
      <div class="carga-body">
        <p><strong>Transportadora:</strong> ${escapeHtml(c.transportadora || "-")}</p>
        <p><strong>Rota:</strong> ${escapeHtml(rota)}</p>
        <p><strong>Volumes:</strong> ${escapeHtml(String(volumes))} &nbsp; • &nbsp; <strong>Pedidos:</strong> ${escapeHtml(String(pedidos))}</p>
        <p><strong>Carregador:</strong> ${escapeHtml(c.carregador || "-")}</p>
        <p><strong>Obs:</strong> ${escapeHtml(observacoes)}</p>
      </div>
      <footer class="carga-footer">
        <button class="btn-ghost btn-sm btn-edit" data-id="${c.id}">Editar</button>
        <button class="btn-danger-outline btn-sm btn-delete" data-id="${c.id}">Excluir</button>
      </footer>
    </article>
  `;
}

function atualizarResumo(lista) {
  totalCargasEl.textContent = lista.length;
  totalVolumesEl.textContent = lista.reduce((acc, c) => acc + (Number(c.volumes) || 0), 0);
  totalPedidosEl.textContent = lista.reduce((acc, c) => acc + (Number(c.pedidos) || 0), 0);
}

// ===============================
// SUBMIT / EDIT / DELETE
// ===============================
async function handleSubmit(e) {
  e.preventDefault();
  if (!currentUser) return;

  const payload = {
    numeroCarga: form.numeroCarga.value.trim(),
    data: form.data.value,
    transportadora: form.transportadora.value.trim(),
    rota: form.rota.value.trim(),
    volumes: form.volumes.value.trim(),
    pedidos: form.pedidos.value.trim(),
    carregador: form.carregador.value.trim(),
    situacao: form.situacao.value,
    observacoes: form.observacoes.value.trim(),
    atualizadoEm: serverTimestamp()
  };

  try {
    if (cargaEmEdicaoId) {
      await updateDoc(
        doc(db, "users", currentUser.uid, "cargas", cargaEmEdicaoId),
        payload
      );
    } else {
      await addDoc(
        collection(db, "users", currentUser.uid, "cargas"),
        { ...payload, criadoEm: serverTimestamp() }
      );
    }

    form.reset();
    form.data.value = new Date().toISOString().slice(0, 10);
    cargaEmEdicaoId = null;
    form.querySelector("button[type='submit']").textContent = "Salvar carga";

    await carregarCargas();
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar a carga.");
  }
}

function handleListClick(e) {
  const editBtn = e.target.closest(".btn-edit");
  const deleteBtn = e.target.closest(".btn-delete");

  if (editBtn) {
    const carga = cargas.find(c => c.id === editBtn.dataset.id);
    if (carga) preencherFormularioEdicao(carga);
  }

  if (deleteBtn) {
    const carga = cargas.find(c => c.id === deleteBtn.dataset.id);
    if (!carga) return;

    if (confirm(`Excluir a carga ${carga.numeroCarga} do dia ${formatarData(carga.data)}?`)) {
      excluirCarga(carga.id);
    }
  }
}

function preencherFormularioEdicao(carga) {
  cargaEmEdicaoId = carga.id;

  Object.keys(carga).forEach(k => {
    if (form[k]) form[k].value = carga[k] || "";
  });

  form.querySelector("button[type='submit']").textContent = "Atualizar carga";
  form.scrollIntoView({ behavior: "smooth" });
}

async function excluirCarga(id) {
  await deleteDoc(doc(db, "users", currentUser.uid, "cargas", id));
  await carregarCargas();
}

// ===============================
// RELATÓRIOS / KPIs / GRÁFICOS
// ===============================
function gerarRelatorio() {
  let inicio = document.getElementById("relatorio-inicio").value;
  let fim = document.getElementById("relatorio-fim").value;

  let filtradas = [...cargas];

  if (inicio) filtradas = filtradas.filter(c => c.data >= inicio);
  if (fim) filtradas = filtradas.filter(c => c.data <= fim);

  atualizarResumoRelatorio(filtradas);
  gerarGraficoCargasPorDia(filtradas);
  gerarGraficoVolumesPedidos(filtradas);
  atualizarKPIsRelatorio(filtradas);
}

function atualizarResumoRelatorio(lista) {
  document.getElementById("rel-total-cargas").textContent = lista.length;
  document.getElementById("rel-total-volumes").textContent =
    lista.reduce((s, c) => s + (Number(c.volumes) || 0), 0);
  document.getElementById("rel-total-pedidos").textContent =
    lista.reduce((s, c) => s + (Number(c.pedidos) || 0), 0);
}

function gerarGraficoCargasPorDia(lista) {
  const ctx = document.getElementById("grafico-cargas-dia");
  if (!ctx) return;

  const mapa = {};
  lista.forEach(c => mapa[c.data] = (mapa[c.data] || 0) + 1);

  if (chartCargasDia) chartCargasDia.destroy();

  chartCargasDia = new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(mapa).sort(),
      datasets: [{ label: "Cargas", data: Object.values(mapa) }]
    }
  });
}

function gerarGraficoVolumesPedidos(lista) {
  const ctx = document.getElementById("grafico-volumes-pedidos");
  if (!ctx) return;

  if (chartVolumesPedidos) chartVolumesPedidos.destroy();

  chartVolumesPedidos = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Volumes", "Pedidos"],
      datasets: [{
        data: [
          lista.reduce((s, c) => s + (Number(c.volumes) || 0), 0),
          lista.reduce((s, c) => s + (Number(c.pedidos) || 0), 0)
        ]
      }]
    }
  });
}

function atualizarKPIsRelatorio(lista) {
  const total = lista.length;
  const totalVolumes = lista.reduce((s, c) => s + (Number(c.volumes) || 0), 0);
  const media = total ? (totalVolumes / total).toFixed(1) : 0;
  const problemas = lista.filter(c => c.situacao === "problema").length;

  const mapa = {};
  lista.forEach(c => mapa[c.transportadora] = (mapa[c.transportadora] || 0) + 1);

  const ranking = Object.entries(mapa).sort((a, b) => b[1] - a[1]);

  document.getElementById("kpi-total-cargas").textContent = total;
  document.getElementById("kpi-media-volumes").textContent = media;
  document.getElementById("kpi-problemas").textContent = problemas;
  document.getElementById("kpi-top-transportadora").textContent =
    ranking.length ? ranking[0][0] : "-";

  renderRankingTransportadoras(ranking);
}

function renderRankingTransportadoras(ranking) {
  const container = document.getElementById("ranking-transportadoras");
  if (!container) return;

  container.innerHTML = ranking.length
    ? ranking.map(([nome, total], i) => `
        <div class="ranking-item">
          <span class="ranking-pos">${i + 1}º</span>
          <span class="ranking-name">${nome}</span>
          <span class="ranking-value">${total}</span>
        </div>`).join("")
    : `<p class="empty-state">Sem dados no período.</p>`;
}

// ===============================
// CONFIGURAÇÕES — FIRESTORE
// ===============================
async function carregarConfiguracoes() {
  if (!currentUser) return;

  const ref = doc(db, "users", currentUser.uid, "config", "system");
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    document.getElementById("config-empresa").value = data.empresa || "";
    document.getElementById("config-cidade").value = data.cidade || "";
    document.getElementById("config-auto-relatorio").checked = data.autoRelatorio === true;
  }

  document.getElementById("config-usuario").textContent =
    currentUser.displayName || "Usuário";
  document.getElementById("config-email").textContent =
    currentUser.email || "-";
}

const btnSalvarConfig = document.getElementById("btn-salvar-config");
if (btnSalvarConfig) {
  btnSalvarConfig.onclick = async () => {
    await setDoc(
      doc(db, "users", currentUser.uid, "config", "system"),
      {
        empresa: document.getElementById("config-empresa").value,
        cidade: document.getElementById("config-cidade").value,
        autoRelatorio: document.getElementById("config-auto-relatorio").checked,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    alert("Configurações salvas com sucesso!");
  };
}

const btnLimparDados = document.getElementById("btn-limpar-dados");
if (btnLimparDados) {
  btnLimparDados.onclick = () => {
    if (confirm("Deseja limpar os dados locais do sistema?")) {
      location.reload();
    }
  };
}

const btnLogoutConfig = document.getElementById("btn-logout-config");
if (btnLogoutConfig) {
  btnLogoutConfig.onclick = () => logout();
}

// ===============================
// NAVEGAÇÃO ENTRE TELAS
// ===============================
const screens = document.querySelectorAll(".screen");
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("nav-active"));
    btn.classList.add("nav-active");

    const target = btn.dataset.screen;
    screens.forEach(s => s.classList.remove("screen-active"));

    const targetScreen = document.getElementById(`screen-${target}`);
    if (targetScreen) {
      targetScreen.classList.add("screen-active");
      if (target === "config") await carregarConfiguracoes();
    }
  });
});

// ===============================
// MENU MOBILE + PWA
// ===============================
const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const appNav = document.getElementById("app-nav");

if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener("click", () => {
    appNav.classList.toggle("open");
  });
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js")
    .then(() => console.log("Service Worker registrado"))
    .catch(err => console.error("Erro no SW:", err));
}

window.addEventListener("load", () => {
  const splash = document.getElementById("splash-screen");
  const isPWA =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (splash && isPWA) {
    setTimeout(() => splash.classList.add("hide"), 900);
  } else if (splash) {
    splash.remove();
  }
});

// ===============================
// HELPERS
// ===============================
function formatarData(iso) {
  if (!iso) return "-";
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
