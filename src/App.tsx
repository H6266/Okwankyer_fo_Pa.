import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeLanguageProvider } from "./context/ThemeLanguageContext";
import { LandingPage } from "./pages/LandingPage";
import { DashboardLayout } from "./components/dashboard/DashboardLayout";
import { OverviewPage } from "./pages/dashboard/OverviewPage";
import { VoiceTesterPage } from "./pages/dashboard/VoiceTesterPage";
import { SpeechPlaygroundPage } from "./pages/dashboard/SpeechPlaygroundPage";
import { AudioLibraryPage } from "./pages/dashboard/AudioLibraryPage";
import { ApiTesterPage } from "./pages/dashboard/ApiTesterPage";
import { SafeTransactionPage } from "./pages/dashboard/SafeTransactionPage";
import { KycDirectoryPage } from "./pages/dashboard/KycDirectoryPage";
import { LedgerPage } from "./pages/dashboard/LedgerPage";
import { CallLogsPage } from "./pages/dashboard/CallLogsPage";
import { TestCasesPage } from "./pages/dashboard/TestCasesPage";
import { SettingsPage } from "./pages/dashboard/SettingsPage";
import { DocsPage } from "./pages/dashboard/DocsPage";
import { ShippingPage } from "./pages/dashboard/ShippingPage";
import { TasksPage } from "./pages/dashboard/TasksPage";

export default function App() {
  return (
    <ThemeLanguageProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Marketing Landing Page */}
          <Route path="/" element={<LandingPage />} />

          {/* Developer & QA Testing Dashboard */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="shipping" element={<ShippingPage />} />
            <Route path="api" element={<ApiTesterPage />} />
            <Route path="voice" element={<VoiceTesterPage />} />
            <Route path="speech" element={<SpeechPlaygroundPage />} />
            <Route path="audio" element={<AudioLibraryPage />} />
            <Route path="transaction" element={<SafeTransactionPage />} />
            <Route path="kyc" element={<KycDirectoryPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="calls" element={<CallLogsPage />} />
            <Route path="tests" element={<TestCasesPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="docs" element={<DocsPage />} />
          </Route>

          {/* Fallback to landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeLanguageProvider>
  );
}
