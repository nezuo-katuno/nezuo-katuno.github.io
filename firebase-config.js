// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDjYN-Gvk4cCW-_WD1o8UfUVHukbud4tUM",
  authDomain: "agenda-escolar-a4624.firebaseapp.com",
  projectId: "agenda-escolar-a4624",
  storageBucket: "agenda-escolar-a4624.firebasestorage.app",
  messagingSenderId: "236604812722",
  appId: "1:236604812722:web:04cfb93f47efe3fe4d88ab",
  measurementId: "G-DSLHJJTCJ8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export { db, collection, addDoc, onSnapshot };