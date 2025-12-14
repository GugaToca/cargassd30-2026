// firebase-config.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAA4TQKNMraHzodEUXZBZfbPt2hXwFEtI4",
  authDomain: "diario-de-cargas-2026.firebaseapp.com",
  projectId: "diario-de-cargas-2026",
  storageBucket: "diario-de-cargas-2026.firebasestorage.app",
  messagingSenderId: "470378929608",
  appId: "1:470378929608:web:2996c22772dc96057434fd"
};

// Inicializa apenas UMA VEZ
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Exports para os outros arquivos
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
