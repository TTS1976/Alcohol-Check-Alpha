import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
// Keep Amplify for Lambda function access
import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";
import AuthRouter from './components/AuthRouter';

// Keep Amplify configuration for Lambda function access
Amplify.configure(outputs);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthRouter />
  </React.StrictMode>
);
