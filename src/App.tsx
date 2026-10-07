import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeLanguageProvider } from "./context/ThemeLanguageContext";
import { LandingPage } from "./pages/LandingPage";
import { DashboardLayout } from "./components/dashboard/DashboardLayout";
import { OverviewPage } from "./pages/dashboard/OverviewPage";
import { MomoLabPage } from "./pages/dashboard/MomoLabPage";
import { AsrLabPage } from "./pages/dashboard/AsrLabPage";
import { TtsLabPage } from "./pages/dashboard/TtsLabPage";
import { LlmLabPage } from "./pages/dashboard/LlmLabPage";
import { IvrLabPage } from "./pages/dashboard/IvrLabPage";
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
import { PhoneSimulatorPage } from "./pages/dashboard/PhoneSimulatorPage";
import { PreachModeView } from "./components/study/PreachModeView";

export default function App() {
  return (
    <ThemeLanguageProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Marketing Landing Page */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/preach" element={<PreachModeView />} />

          {/* Developer & QA Testing Dashboard */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<OverviewPage />} />
            {/* Preach Mode Document Study Layer */}
            <Route path="preach" element={<PreachModeView />} />
            {/* Primary Laboratories */}
            <Route path="momo" element={<MomoLabPage />} />
            <Route path="api" element={<MomoLabPage />} />
            <Route path="asr" element={<AsrLabPage />} />
            <Route path="tts" element={<TtsLabPage />} />
            <Route path="llm" element={<LlmLabPage />} />
            <Route path="ivr" element={<IvrLabPage />} />
            
            {/* Core Verification & Tools */}
            <Route path="tests" element={<TestCasesPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="phone" element={<PhoneSimulatorPage />} />
            <Route path="settings" element={<SettingsPage />} />

            {/* Backwards-compatible Secondary Routes */}
            <Route path="shipping" element={<ShippingPage />} />
            <Route path="voice" element={<VoiceTesterPage />} />
            <Route path="speech" element={<SpeechPlaygroundPage />} />
            <Route path="audio" element={<AudioLibraryPage />} />
            <Route path="transaction" element={<SafeTransactionPage />} />
            <Route path="kyc" element={<KycDirectoryPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="calls" element={<CallLogsPage />} />
            <Route path="docs" element={<DocsPage />} />
          </Route>

          {/* Fallback to landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeLanguageProvider>
  );
}
