// app.js

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

// Protege a rota e carrega dados do usuário
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  usuarioNomeEl.textContent = user.displayName || user.email;

  init();
});

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

  // BOTÃO GERAR RELATÓRIO
  const btnGerarRelatorio = document.getElementById("btn-gerar-relatorio");
  if (btnGerarRelatorio) {
    btnGerarRelatorio.onclick = gerarRelatorio;
  }

  carregarCargas();
}

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
  const totalCargas = lista.length;
  const totalVolumes = lista.reduce(
    (acc, c) => acc + (Number(c.volumes) || 0),
    0
  );
  const totalPedidos = lista.reduce(
    (acc, c) => acc + (Number(c.pedidos) || 0),
    0
  );

  totalCargasEl.textContent = totalCargas;
  totalVolumesEl.textContent = totalVolumes;
  totalPedidosEl.textContent = totalPedidos;
}

async function handleSubmit(e) {
  e.preventDefault();
  if (!currentUser) return;

  const numeroCarga = form.numeroCarga.value.trim();
  const data = form.data.value;
  const transportadora = form.transportadora.value.trim();
  const rota = form.rota.value.trim();
  const volumes = form.volumes.value.trim();
  const pedidos = form.pedidos.value.trim();
  const carregador = form.carregador.value.trim();
  const situacao = form.situacao.value;
  const observacoes = form.observacoes.value.trim();

  if (!numeroCarga || !data || !transportadora) {
    alert("Preencha pelo menos: Data, Nº da carga e Transportadora.");
    return;
  }

  const payload = {
    numeroCarga,
    data,
    transportadora,
    rota,
    volumes,
    pedidos,
    carregador,
    situacao,
    observacoes,
    atualizadoEm: serverTimestamp()
  };

  try {
    if (cargaEmEdicaoId) {
      const ref = doc(db, "users", currentUser.uid, "cargas", cargaEmEdicaoId);
      await updateDoc(ref, payload);
    } else {
      const ref = collection(db, "users", currentUser.uid, "cargas");
      await addDoc(ref, {
        ...payload,
        criadoEm: serverTimestamp()
      });
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
    const id = editBtn.dataset.id;
    const carga = cargas.find((c) => c.id === id);
    if (carga) preencherFormularioEdicao(carga);
  }

  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    const carga = cargas.find((c) => c.id === id);
    if (!carga) return;

    const confirmar = confirm(
      `Excluir a carga ${carga.numeroCarga} do dia ${formatarData(carga.data)}?`
    );

    if (confirmar) {
      excluirCarga(id);
    }
  }
}

function preencherFormularioEdicao(carga) {
  cargaEmEdicaoId = carga.id;

  form.numeroCarga.value = carga.numeroCarga || "";
  form.data.value = carga.data || "";
  form.transportadora.value = carga.transportadora || "";
  form.rota.value = carga.rota || "";
  form.volumes.value = carga.volumes || "";
  form.pedidos.value = carga.pedidos || "";
  form.carregador.value = carga.carregador || "";
  form.situacao.value = carga.situacao || "ok";
  form.observacoes.value = carga.observacoes || "";

  form.querySelector("button[type='submit']").textContent = "Atualizar carga";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function excluirCarga(id) {
  if (!currentUser) return;
  try {
    const ref = doc(db, "users", currentUser.uid, "cargas", id);
    await deleteDoc(ref);
    await carregarCargas();
  } catch (err) {
    console.error(err);
    alert("Erro ao excluir a carga.");
  }
}

function exportarPDF() {
  const filtradas = getCargasFiltradas();

  if (!filtradas.length) {
    alert("Não há cargas para exportar com os filtros atuais.");
    return;
  }

  const win = window.open("", "_blank");
  if (!win) {
    alert("Pop-up bloqueado. Libere pop-ups para exportar.");
    return;
  }

  const linhas = filtradas
    .map((c) => {
      return `
        <tr>
          <td>${escapeHtml(formatarData(c.data))}</td>
          <td>${escapeHtml(c.numeroCarga || "")}</td>
          <td>${escapeHtml(c.transportadora || "")}</td>
          <td>${escapeHtml(c.rota || "")}</td>
          <td>${escapeHtml(String(c.volumes || "-"))}</td>
          <td>${escapeHtml(String(c.pedidos || "-"))}</td>
          <td>${escapeHtml(c.carregador || "")}</td>
          <td>${c.situacao === "ok" ? "OK" : "Problema"}</td>
          <td>${escapeHtml(c.observacoes || "")}</td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Relatório de Cargas</title>
        <style>
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            padding: 24px;
            color: #111827;
          }
          h1 { margin-bottom: 4px; }
          h2 { margin-top: 0; font-size: 14px; color: #6b7280; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
            font-size: 12px;
          }
          th, td {
            border: 1px solid #e5e7eb;
            padding: 4px 6px;
            vertical-align: top;
          }
          th {
            background: #f3f4f6;
            text-align: left;
          }
        </style>
      </head>
      <body>
        <h1>Relatório de Cargas</h1>
        <h2>Gerado em ${new Date().toLocaleString("pt-BR")}</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Nº Carga</th>
              <th>Transportadora</th>
              <th>Rota</th>
              <th>Volumes</th>
              <th>Pedidos</th>
              <th>Carregador</th>
              <th>Situação</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            ${linhas}
          </tbody>
        </table>
        <script>
          window.print();
        </script>
      </body>
    </html>
  `;

  win.document.write(html);
  win.document.close();
}

function formatarData(iso) {
  if (!iso) return "-";
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// NAVEGAÇÃO ENTRE TELAS (CHAMADA DE CONFIG NO LUGAR CERTO)
const screens = document.querySelectorAll(".screen");

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {

    document.querySelectorAll(".nav-btn").forEach(b =>
      b.classList.remove("nav-active")
    );
    btn.classList.add("nav-active");

    const target = btn.dataset.screen;

    screens.forEach(screen => {
      screen.classList.remove("screen-active");
    });

    const targetScreen = document.getElementById(`screen-${target}`);

    if (targetScreen) {
      targetScreen.classList.add("screen-active");
      if (target === "config") {
        carregarConfiguracoes();
      }
    } else {
      alert(`Tela "${target}" ainda será adicionada 👨‍💻`);
    }
  });
});

// MENU MOBILE
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
    setTimeout(() => {
      splash.classList.add("hide");
    }, 900);
  } else if (splash) {
    splash.remove();
  }
});

// ======================
// CONFIGURAÇÕES — FIRESTORE (NOVO)
// ======================
async function carregarConfiguracoes() {
  if (!currentUser) return;

  const ref = doc(db, "users", currentUser.uid, "config", "system");
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    document.getElementById("config-empresa").value = data.empresa || "";
    document.getElementById("config-cidade").value = data.cidade || "";
    document.getElementById("config-auto-relatorio").checked =
      data.autoRelatorio === true;
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
  btnLogoutConfig.onclick = () => {
    logout();
  };
}
