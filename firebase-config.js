// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDS5LQJvSQEONYtK5Op5zLrJ8bgiQvsy2o",
  authDomain: "agenda-escolar-27c56.firebaseapp.com",
  projectId: "agenda-escolar-27c56",
  storageBucket: "agenda-escolar-27c56.firebasestorage.app",
  messagingSenderId: "54115560266",
  appId: "1:54115560266:web:f35cbfa33ff3e9e4c46fb3",
  measurementId: "G-V2GG8GKNCE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export { db, collection, addDoc, doc, deleteDoc, onSnapshot };