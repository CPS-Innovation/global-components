import React from "react";
import { Navigate } from "react-router-dom";

const Home: React.FC = () => {
  return <Navigate to="/tasks" replace />;
};

export default Home;
