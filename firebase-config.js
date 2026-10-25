import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDS5LQJvSQEONYtK5Op5zLrJ8bgiQvsy2o",
  authDomain: "agenda-escolar-27c56.firebaseapp.com",
  projectId: "agenda-escolar-27c56",
  storageBucket: "agenda-escolar-27c56.firebasestorage.app",
  messagingSenderId: "54115560266",
  appId: "1:54115560266:web:f35cbfa33ff3e9e4c46fb3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app); // Inicialização do Firestore corrigida

export { db, collection, addDoc, doc, deleteDoc, onSnapshot };