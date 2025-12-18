// ================================
// app.js — NOVA SD LOGÍSTICA
// ================================

let chartCargasDia = null;
let chartVolumesPedidos = null;

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { logout } from "./auth.js";

// ================================
// ESTADO GLOBAL
// ================================
let currentUser = null;
let cargas = [];
let cargaEmEdicaoId = null;

// ================================
// ELEMENTOS DOM
// ================================
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

// ================================
// AUTENTICAÇÃO
// ================================
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  usuarioNomeEl.textContent = user.displayName || user.email;
  init();
});

// ================================
// INIT
// ================================
function init() {
  const hoje = new Date().toISOString().slice(0, 10);
  if (form?.data) form.data.value = hoje;

  form.addEventListener("submit", handleSubmit);
  filtroDataEl.addEventListener("change", renderCargas);
  filtroBuscaEl.addEventListener("input", renderCargas);
  btnExportar.addEventListener("click", exportarPDF);
  btnLimparFiltros.addEventListener("click", limparFiltros);
  btnLogout.addEventListener("click", logout);
  listEl.addEventListener("click", handleListClick);

  const btnGerarRelatorio = document.getElementById("btn-gerar-relatorio");
  if (btnGerarRelatorio) btnGerarRelatorio.onclick = gerarRelatorio;

  carregarConfiguracoes();
  carregarCargas();
}

// ================================
// FIRESTORE — CARGAS (GLOBAL)
// ================================
async function carregarCargas() {
  listEl.innerHTML = `<p class="info-text">Carregando cargas...</p>`;

  try {
    const ref = collection(db, "cargas");
    const q = query(ref, orderBy("data", "desc"), orderBy("numeroCarga", "desc"));
    const snap = await getDocs(q);

    cargas = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    renderCargas();
  } catch (err) {
    console.error(err);
    listEl.innerHTML = `<p class="error-text">Erro ao carregar cargas.</p>`;
  }
}

// ================================
// FILTROS
// ================================
function getCargasFiltradas() {
  const dataFiltro = filtroDataEl.value;
  const busca = filtroBuscaEl.value.trim().toLowerCase();

  return cargas.filter(c => {
    if (dataFiltro && c.data !== dataFiltro) return false;

    if (busca) {
      const texto = [
        c.numeroCarga,
        c.transportadora,
        c.rota,
        c.carregador,
        c.observacoes
      ].filter(Boolean).join(" ").toLowerCase();

      return texto.includes(busca);
    }
    return true;
  });
}

// ================================
// RENDER
// ================================
function renderCargas() {
  const filtradas = getCargasFiltradas();

  listEl.innerHTML = filtradas.length
    ? filtradas.map(criarCardCarga).join("")
    : `<p class="empty-state">Nenhuma carga encontrada.</p>`;

  atualizarResumo(filtradas);
}

function limparFiltros(e) {
  e.preventDefault();
  filtroDataEl.value = "";
  filtroBuscaEl.value = "";
  renderCargas();
}

// ================================
// CARD
// ================================
function criarCardCarga(c) {
  return `
    <article class="carga-card" data-id="${c.id}">
      <header class="carga-header">
        <div>
          <span class="carga-numero">Carga ${escapeHtml(c.numeroCarga || "")}</span>
          <span class="carga-data">${formatarData(c.data)}</span>
        </div>
        <span class="chip chip--${c.situacao || "ok"}">
          ${c.situacao === "problema" ? "Problema" : "OK"}
        </span>
      </header>

      <div class="carga-body">
        <p><strong>Transportadora:</strong> ${escapeHtml(c.transportadora || "-")}</p>
        <p><strong>Rota:</strong> ${escapeHtml(c.rota || "-")}</p>
        <p><strong>Volumes:</strong> ${c.volumes || "-"} • <strong>Pedidos:</strong> ${c.pedidos || "-"}</p>
        <p><strong>Carregador:</strong> ${escapeHtml(c.carregador || "-")}</p>
        <p><strong>Obs:</strong> ${escapeHtml(c.observacoes || "-")}</p>
      </div>

      <footer class="carga-footer">
        <button class="btn-ghost btn-sm btn-edit" data-id="${c.id}">Editar</button>
        <button class="btn-danger-outline btn-sm btn-delete" data-id="${c.id}">Excluir</button>
      </footer>
    </article>
  `;
}

// ================================
// RESUMO
// ================================
function atualizarResumo(lista) {
  totalCargasEl.textContent = lista.length;
  totalVolumesEl.textContent = lista.reduce((s, c) => s + (Number(c.volumes) || 0), 0);
  totalPedidosEl.textContent = lista.reduce((s, c) => s + (Number(c.pedidos) || 0), 0);
}

// ================================
// SALVAR / EDITAR
// ================================
async function handleSubmit(e) {
  e.preventDefault();

  const payload = {
    numeroCarga: form.numeroCarga.value.trim(),
    data: form.data.value,
    transportadora: form.transportadora.value.trim(),
    rota: form.rota.value.trim(),
    volumes: form.volumes.value,
    pedidos: form.pedidos.value,
    carregador: form.carregador.value.trim(),
    situacao: form.situacao.value,
    observacoes: form.observacoes.value.trim(),
    atualizadoEm: serverTimestamp()
  };

  try {
    if (cargaEmEdicaoId) {
      await updateDoc(doc(db, "cargas", cargaEmEdicaoId), payload);
    } else {
      await addDoc(collection(db, "cargas"), {
        ...payload,
        criadoEm: serverTimestamp(),
        criadoPor: {
          uid: currentUser.uid,
          nome: currentUser.displayName || currentUser.email
        }
      });
    }

    form.reset();
    form.data.value = new Date().toISOString().slice(0, 10);
    cargaEmEdicaoId = null;
    form.querySelector("button[type='submit']").textContent = "Salvar carga";
    carregarCargas();
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar a carga.");
  }
}

// ================================
// EDITAR / EXCLUIR
// ================================
function handleListClick(e) {
  const edit = e.target.closest(".btn-edit");
  const del = e.target.closest(".btn-delete");

  if (edit) {
    const carga = cargas.find(c => c.id === edit.dataset.id);
    if (carga) preencherFormularioEdicao(carga);
  }

  if (del && confirm("Excluir esta carga?")) {
    excluirCarga(del.dataset.id);
  }
}

function preencherFormularioEdicao(c) {
  cargaEmEdicaoId = c.id;

  form.numeroCarga.value = c.numeroCarga || "";
  form.data.value = c.data || "";
  form.transportadora.value = c.transportadora || "";
  form.rota.value = c.rota || "";
  form.volumes.value = c.volumes || "";
  form.pedidos.value = c.pedidos || "";
  form.carregador.value = c.carregador || "";
  form.situacao.value = c.situacao || "ok";
  form.observacoes.value = c.observacoes || "";

  form.querySelector("button[type='submit']").textContent = "Atualizar carga";
  form.scrollIntoView({ behavior: "smooth" });
}

async function excluirCarga(id) {
  await deleteDoc(doc(db, "cargas", id));
  carregarCargas();
}

// ================================
// CONFIGURAÇÕES (LOCAL)
// ================================
function carregarConfiguracoes() {
  const empresa = localStorage.getItem("config_empresa") || "";
  const cidade = localStorage.getItem("config_cidade") || "";
  const autoRel = localStorage.getItem("config_auto_relatorio") === "true";

  document.getElementById("config-empresa").value = empresa;
  document.getElementById("config-cidade").value = cidade;
  document.getElementById("config-auto-relatorio").checked = autoRel;

  if (currentUser) {
    document.getElementById("config-usuario").textContent =
      currentUser.displayName || "Usuário";
    document.getElementById("config-email").textContent = currentUser.email;
  }
}

// ================================
// UTILIDADES
// ================================
function formatarData(iso) {
  if (!iso) return "-";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.addEventListener("load", () => {
  const splash = document.getElementById("splash-screen");

  if (splash) {
    setTimeout(() => {
      splash.classList.add("hide");
    }, 600);
  }
});
