// ==========================
// IMPORTS FIREBASE
// ==========================
import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ==========================
// ESTADO GLOBAL
// ==========================
let currentUser = null;
let cargas = [];

let chartCargasDia = null;
let chartVolumesPedidos = null;

// ==========================
// AUTH
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  document.getElementById("usuario-nome").textContent =
    user.displayName || "Usuário";

  await carregarCargas();
});

// ==========================
// NAVEGAÇÃO SPA
// ==========================
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn")
      .forEach(b => b.classList.remove("nav-active"));
    btn.classList.add("nav-active");

    document.querySelectorAll(".screen")
      .forEach(s => s.classList.remove("screen-active"));

    const target = btn.dataset.screen;
    document.getElementById(`screen-${target}`)
      .classList.add("screen-active");

    if (target === "config") {
      carregarConfiguracoes();
    }

    if (target === "relatorios") {
      setTimeout(() => {
        gerarRelatorio();
      }, 100);
    }
  });
});

// ==========================
// LOGOUT
// ==========================
document.getElementById("logout-header").onclick = async () => {
  await signOut(auth);
  window.location.href = "login.html";
};

// ==========================
// CARGAS — CRUD
// ==========================
const form = document.getElementById("carga-form");
const listEl = document.getElementById("cargas-list");

form.onsubmit = async (e) => {
  e.preventDefault();

  const data = {
    data: form.data.value,
    numeroCarga: form.numeroCarga.value,
    transportadora: form.transportadora.value,
    rota: form.rota.value,
    volumes: Number(form.volumes.value || 0),
    pedidos: Number(form.pedidos.value || 0),
    carregador: form.carregador.value,
    situacao: form.situacao.value,
    observacoes: form.observacoes.value,
    createdAt: serverTimestamp()
  };

  await addDoc(
    collection(db, "users", currentUser.uid, "cargas"),
    data
  );

  form.reset();
  await carregarCargas();
};

async function carregarCargas() {
  cargas = [];

  const q = query(
    collection(db, "users", currentUser.uid, "cargas"),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);

  snap.forEach(docSnap => {
    cargas.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  renderCargas();
}

function renderCargas() {
  listEl.innerHTML = "";

  cargas.forEach(c => {
    const el = document.createElement("div");
    el.className = "carga-card";
    el.innerHTML = `
      <strong>${c.numeroCarga}</strong> — ${c.transportadora}<br>
      Data: ${c.data} | Volumes: ${c.volumes} | Pedidos: ${c.pedidos}
      <button data-id="${c.id}" class="btn-delete">Excluir</button>
    `;
    listEl.appendChild(el);
  });

  atualizarResumo();
}

listEl.onclick = async (e) => {
  if (!e.target.classList.contains("btn-delete")) return;

  const id = e.target.dataset.id;
  await deleteDoc(
    doc(db, "users", currentUser.uid, "cargas", id)
  );

  await carregarCargas();
};

function atualizarResumo() {
  document.getElementById("total-cargas").textContent = cargas.length;
  document.getElementById("total-volumes").textContent =
    cargas.reduce((s, c) => s + c.volumes, 0);
  document.getElementById("total-pedidos").textContent =
    cargas.reduce((s, c) => s + c.pedidos, 0);
}

// ==========================
// RELATÓRIOS
// ==========================
function gerarRelatorio() {
  const inicio = document.getElementById("relatorio-inicio").value;
  const fim = document.getElementById("relatorio-fim").value;

  let filtradas = [...cargas];

  if (inicio) filtradas = filtradas.filter(c => c.data >= inicio);
  if (fim) filtradas = filtradas.filter(c => c.data <= fim);

  atualizarResumoRelatorio(filtradas);
  atualizarKPIsRelatorio(filtradas);
  gerarGraficoCargasPorDia(filtradas);
  gerarGraficoVolumesPedidos(filtradas);
}

document.getElementById("btn-gerar-relatorio").onclick = gerarRelatorio;

function atualizarResumoRelatorio(lista) {
  document.getElementById("rel-total-cargas").textContent = lista.length;
  document.getElementById("rel-total-volumes").textContent =
    lista.reduce((s, c) => s + c.volumes, 0);
  document.getElementById("rel-total-pedidos").textContent =
    lista.reduce((s, c) => s + c.pedidos, 0);
}

// ==========================
// KPIs + RANKING
// ==========================
function atualizarKPIsRelatorio(lista) {
  const total = lista.length;
  const volumes = lista.reduce((s, c) => s + c.volumes, 0);
  const media = total ? (volumes / total).toFixed(1) : 0;
  const problemas = lista.filter(c => c.situacao === "problema").length;

  const mapa = {};
  lista.forEach(c => {
    mapa[c.transportadora] =
      (mapa[c.transportadora] || 0) + 1;
  });

  const ranking = Object.entries(mapa)
    .sort((a, b) => b[1] - a[1]);

  document.getElementById("kpi-total-cargas").textContent = total;
  document.getElementById("kpi-media-volumes").textContent = media;
  document.getElementById("kpi-problemas").textContent = problemas;
  document.getElementById("kpi-top-transportadora").textContent =
    ranking[0]?.[0] || "-";

  renderRankingTransportadoras(ranking);
}

function renderRankingTransportadoras(ranking) {
  const el = document.getElementById("ranking-transportadoras");
  el.innerHTML = "";

  ranking.forEach(([nome, total], i) => {
    el.innerHTML += `
      <div class="ranking-item">
        <span class="ranking-pos">${i + 1}º</span>
        <span class="ranking-name">${nome}</span>
        <span class="ranking-value">${total}</span>
      </div>
    `;
  });
}

// ==========================
// GRÁFICOS
// ==========================
function gerarGraficoCargasPorDia(lista) {
  const ctx = document.getElementById("grafico-cargas-dia");

  const mapa = {};
  lista.forEach(c => {
    mapa[c.data] = (mapa[c.data] || 0) + 1;
  });

  if (chartCargasDia) chartCargasDia.destroy();

  chartCargasDia = new Chart(ctx, {
    type: "line",
    data: {
      labels: Object.keys(mapa),
      datasets: [{
        label: "Cargas",
        data: Object.values(mapa)
      }]
    }
  });
}

function gerarGraficoVolumesPedidos(lista) {
  const ctx = document.getElementById("grafico-volumes-pedidos");

  if (chartVolumesPedidos) chartVolumesPedidos.destroy();

  chartVolumesPedidos = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Volumes", "Pedidos"],
      datasets: [{
        data: [
          lista.reduce((s, c) => s + c.volumes, 0),
          lista.reduce((s, c) => s + c.pedidos, 0)
        ]
      }]
    }
  });
}

// ==========================
// CONFIGURAÇÕES (FIRESTORE)
// ==========================
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

document.getElementById("btn-salvar-config").onclick = async () => {
  const ref = doc(db, "users", currentUser.uid, "config", "system");

  await setDoc(ref, {
    empresa: document.getElementById("config-empresa").value,
    cidade: document.getElementById("config-cidade").value,
    autoRelatorio: document.getElementById("config-auto-relatorio").checked,
    updatedAt: serverTimestamp()
  });

  alert("Configurações salvas com sucesso ✔");
};

document.getElementById("btn-limpar-dados").onclick = () => {
  if (confirm("Deseja limpar os dados locais?")) {
    location.reload();
  }
};

document.getElementById("btn-logout-config").onclick = async () => {
  await signOut(auth);
  window.location.href = "login.html";
};
