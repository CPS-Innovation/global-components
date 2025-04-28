import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
// @ts-ignore: Unreachable code error
import "./styles/globals.scss";

// Components
import Layout from "./components/Layout";

// Pages
import Cases from "./pages/Cases";
import CaseDetails from "./pages/CaseDetails";
import Help from "./pages/Help";
import Privacy from "./pages/Privacy";
import Cookies from "./pages/Cookies";
import Review from "./pages/Review";
import Tasks from "./pages/Tasks";
import Materials from "./pages/Materials";
import { useGlobalNavigation } from "./hooks/useGlobalNavigation";

export const App: React.FC = () => {
  useGlobalNavigation();
  return (
    <div className="app govuk-template__body js-enabled">
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/cases" element={<Cases />} />
          <Route
            path="/cases/urns/:urn/cases/:caseId"
            element={<CaseDetails />}
          />
          <Route
            path="/cases/urns/:urn/cases/:caseId/review"
            element={<Review />}
          />
          <Route
            path="/cases/urns/:urn/cases/:caseId/materials"
            element={<Materials />}
          />
          <Route path="/help" element={<Help />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/cookies" element={<Cookies />} />
        </Routes>
      </Layout>
    </div>
  );
};

export default App;
