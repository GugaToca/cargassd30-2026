// auth.js — NOVA SD LOGÍSTICA 2.0

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ================================
// REDIRECIONAMENTO AUTOMÁTICO
// ================================
onAuthStateChanged(auth, (user) => {
  const path = window.location.pathname;
  const isAuthPage = path.includes("login") || path.includes("cadastro");

  if (user && isAuthPage) {
    window.location.href = "index.html";
  }
});

// ================================
// LOGIN / CADASTRO
// ================================
document.addEventListener("DOMContentLoaded", () => {

  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");

  // ---------------- LOGIN ----------------
  if (loginForm) {
    const errorEl = document.getElementById("login-error");

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.textContent = "";

      const email = loginForm.email.value.trim();
      const senha = loginForm.senha.value.trim();

      if (!email || !senha) {
        errorEl.textContent = "Preencha e-mail e senha.";
        return;
      }

      try {
        await signInWithEmailAndPassword(auth, email, senha);
        window.location.href = "index.html";
      } catch (err) {
        errorEl.textContent = "E-mail ou senha inválidos.";
      }
    });
  }

  // ---------------- CADASTRO ----------------
  if (registerForm) {
    const errorEl = document.getElementById("register-error");

    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.textContent = "";

      const empresa = registerForm.empresa.value.trim();
      const cidade = registerForm.cidade.value.trim();
      const nome = registerForm.nome.value.trim();
      const email = registerForm.email.value.trim();
      const senha = registerForm.senha.value.trim();
      const confirmar = registerForm.confirmar.value.trim();

      if (!empresa || !cidade || !nome || !email || !senha || !confirmar) {
        errorEl.textContent = "Preencha todos os campos.";
        return;
      }

      if (senha !== confirmar) {
        errorEl.textContent = "As senhas não coincidem.";
        return;
      }

      try {
        // 1. Cria usuário
        const cred = await createUserWithEmailAndPassword(auth, email, senha);
        await updateProfile(cred.user, { displayName: nome });

        // 2. Cria empresa
        const empresaRef = await addDoc(collection(db, "empresas"), {
          nome: empresa,
          cidade,
          criadoEm: serverTimestamp()
        });

        // 3. Cria vínculo do usuário
        await setDoc(doc(db, "users", cred.user.uid), {
          nome,
          email,
          empresaId: empresaRef.id,
          role: "admin",
          criadoEm: serverTimestamp()
        });

        // 4. Registra usuário dentro da empresa
        await setDoc(doc(db, "empresas", empresaRef.id, "usuarios", cred.user.uid), {
          nome,
          email,
          role: "admin",
          criadoEm: serverTimestamp()
        });

        window.location.href = "index.html";

      } catch (err) {
        console.error(err);
        errorEl.textContent = "Erro ao criar empresa.";
      }
    });
  }
});

// ================================
// LOGOUT
// ================================
export async function logout() {
  await signOut(auth);
  window.location.href = "login.html";
}
