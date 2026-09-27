import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import UserDetail from "./pages/UserDetail";
import Groups from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";
import OAuthApps from "./pages/OAuthApps";
import OAuthAppDetail from "./pages/OAuthAppDetail";
import SignedOut from "./pages/SignedOut";

export default function App() {
  return (
    <Routes>
      <Route path="/signed-out" element={<SignedOut />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/users" element={<Users />} />
        <Route path="/users/:id" element={<UserDetail />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
        <Route path="/oauth2" element={<OAuthApps />} />
        <Route path="/oauth2/:id" element={<OAuthAppDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
