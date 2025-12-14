// auth.js
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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Redireciona usuário logado para o dashboard se estiver em login/cadastro
onAuthStateChanged(auth, (user) => {
  const path = window.location.pathname;
  const isAuthPage = path.includes("login") || path.includes("cadastro");

  if (user && isAuthPage) {
    window.location.href = "index.html";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");

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
        console.error(err);
        let msg = "Não foi possível fazer login.";
        if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found") {
          msg = "E-mail ou senha inválidos.";
        }
        errorEl.textContent = msg;
      }
    });
  }

  if (registerForm) {
    const errorEl = document.getElementById("register-error");

    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.textContent = "";

      const nome = registerForm.nome.value.trim();
      const email = registerForm.email.value.trim();
      const senha = registerForm.senha.value.trim();
      const confirmar = registerForm.confirmar.value.trim();

      if (!nome || !email || !senha || !confirmar) {
        errorEl.textContent = "Preencha todos os campos.";
        return;
      }

      if (senha !== confirmar) {
        errorEl.textContent = "As senhas não coincidem.";
        return;
      }

      try {
        const cred = await createUserWithEmailAndPassword(auth, email, senha);

        // Atualiza o displayName do usuário
        await updateProfile(cred.user, { displayName: nome });

        // Cria documento do usuário
        await setDoc(doc(db, "users", cred.user.uid), {
          nome,
          email,
          criadoEm: serverTimestamp()
        });

        window.location.href = "index.html";
      } catch (err) {
        console.error(err);
        let msg = "Erro ao criar conta.";
        if (err.code === "auth/email-already-in-use") {
          msg = "Esse e-mail já está em uso.";
        }
        errorEl.textContent = msg;
      }
    });
  }
});

// Função de logout usada no dashboard
export async function logout() {
  await signOut(auth);
  window.location.href = "login.html";
}
