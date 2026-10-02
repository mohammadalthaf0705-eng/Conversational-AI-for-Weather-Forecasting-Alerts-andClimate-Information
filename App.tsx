import { useState, useEffect } from 'react';
import './App.css';
import type {
  CurrentWeather,
  DailyForecastItem,
  HourlyForecastItem,
  LocationData,
  SupportedLanguage,
  UserRole,
  WeatherAlert,
  PendingAlertApproval,
  AlertAuditLogItem,
  MultiHazardRiskReport,
  RainfallNowcastTimeline,
  RiskAssessmentItem,
} from './types/weather';
import { fetchWeatherData, INDIAN_LOCATIONS, type WeatherDataBundle } from './services/weatherService';
import {
  getSavedLocations,
  getStoredDemoMode,
  getStoredLanguage,
  getStoredRole,
  saveSavedLocations,
  saveStoredDemoMode,
  saveStoredLanguage,
  saveStoredRole,
} from './services/storageService';
import { evaluateWeatherRisks } from './services/weatherRiskEngine';
import { weatherForecastService } from './services/weatherForecastService';
import { generatePendingAlertApprovalsFromRisks } from './services/alertAgentService';
import { Navbar } from './components/Navbar';
import { LiveWeatherHero } from './components/LiveWeatherHero';
import { HourlyForecastStrip } from './components/HourlyForecastStrip';
import { SevenDayForecastCard } from './components/SevenDayForecastCard';
import { RainfallNowcastCard } from './components/RainfallNowcastCard';
import { WeatherRiskCenter } from './components/WeatherRiskCenter';
import { AlertApprovalCenter } from './components/AlertApprovalCenter';
import { HyperlocalLocationModal } from './components/HyperlocalLocationModal';
import { WeatherAssistant } from './components/WeatherAssistant';
import { WeatherMap } from './components/WeatherMap';
import { AlertsCenter } from './components/AlertsCenter';
import { ClimateAnalytics } from './components/ClimateAnalytics';
import { SectorAdvisoryHub } from './components/SectorAdvisoryHub';
import { DemoModeModal } from './components/DemoModeModal';
import type { DemoScenario } from './components/DemoModeModal';
import { SavedLocationsDrawer } from './components/SavedLocationsDrawer';
import { ReportGeneratorModal } from './components/ReportGeneratorModal';
import { Footer } from './components/Footer';
import { ScenarioSimulator } from './components/ScenarioSimulator';
import { ImpactAssessmentDashboard } from './components/ImpactAssessmentDashboard';
import { DisasterActionPlanner } from './components/DisasterActionPlanner';
import { WeatherEventTimeline } from './components/WeatherEventTimeline';
import { IncidentReplayPlayer } from './components/IncidentReplayPlayer';
import { AiPerformanceDashboard } from './components/AiPerformanceDashboard';
import { CitizenReportingModal } from './components/CitizenReportingModal';
import { OfflineBanner } from './components/OfflineBanner';
import { MausamAiGuidanceAgent } from './components/MausamAiGuidanceAgent';
import { impactEngineService } from './services/impactEngineService';
import { offlineSyncService } from './services/offlineSyncService';

export const App = () => {
  // State Initialization
  const [savedLocations, setSavedLocations] = useState<LocationData[]>(() => getSavedLocations());
  const [activeLocation, setActiveLocation] = useState<LocationData>(
    () => savedLocations[0] || INDIAN_LOCATIONS[0]
  );
  const [activeRole, setActiveRole] = useState<UserRole>(() => getStoredRole());
  const [language, setLanguage] = useState<SupportedLanguage>(() => getStoredLanguage());
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => getStoredDemoMode());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Weather Data State
  const [currentWeather, setCurrentWeather] = useState<CurrentWeather | null>(null);
  const [hourlyForecast, setHourlyForecast] = useState<HourlyForecastItem[]>([]);
  const [dailyForecast, setDailyForecast] = useState<DailyForecastItem[]>([]);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(true);

  // New Engines State: Risk, Nowcast, Operator Approvals, Audit
  const [riskReport, setRiskReport] = useState<MultiHazardRiskReport | null>(null);
  const [nowcastTimeline, setNowcastTimeline] = useState<RainfallNowcastTimeline | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingAlertApproval[]>([]);
  const [auditLog, setAuditLog] = useState<AlertAuditLogItem[]>([]);

  // Modals state
  const [isDemoModalOpen, setIsDemoModalOpen] = useState<boolean>(false);
  const [isSavedLocationsOpen, setIsSavedLocationsOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isHyperlocalModalOpen, setIsHyperlocalModalOpen] = useState<boolean>(false);
  const [isCitizenReportOpen, setIsCitizenReportOpen] = useState<boolean>(false);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(() => offlineSyncService.isSimulatedOffline());

  const fallbackWeather: CurrentWeather = {
    temp: 28,
    feelsLike: 31,
    tempMin: 24,
    tempMax: 32,
    condition: 'Heavy Cloud / Convective Showers',
    conditionCode: 80,
    rainfall: 15,
    rainfallProbability: 75,
    humidity: 78,
    windSpeed: 24,
    windDirection: 220,
    windGust: 36,
    pressure: 1008,
    dewPoint: 22,
    uvIndex: 4,
    cloudCover: 80,
    visibility: 6,
    sunrise: '06:00 AM',
    sunset: '06:30 PM',
    aqi: 95,
    aqiStatus: 'Moderate',
    timestamp: new Date().toISOString(),
    dataSource: 'IMD Synoptic Automated Station & Doppler Radar',
    isDemoData: false,
  };

  // Compute Primary Hazard & Impact Assessment Report
  const primaryHazard =
    riskReport?.risks.find((r) => r.category === riskReport.maxRiskCategory) ||
    riskReport?.risks[0];
  const impactReport = primaryHazard
    ? impactEngineService.estimateDisasterImpact(
        activeLocation,
        primaryHazard,
        currentWeather || fallbackWeather
      )
    : null;

  const weatherBundle: WeatherDataBundle | null = currentWeather
    ? {
        current: currentWeather,
        hourly: hourlyForecast,
        daily: dailyForecast,
        alerts: alerts,
        location: activeLocation,
      }
    : null;

  // Load weather data on location or demo mode change
  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      setIsLoadingWeather(true);
      try {
        const bundle = await fetchWeatherData(activeLocation, isDemoMode);
        if (!isCancelled) {
          setCurrentWeather(bundle.current);
          setHourlyForecast(bundle.hourly);
          setDailyForecast(bundle.daily);
          setAlerts(bundle.alerts);

          // Cache weather bundle for offline resiliency
          offlineSyncService.cacheWeatherBundle(activeLocation, {
            current: bundle.current,
            hourly: bundle.hourly,
            daily: bundle.daily,
            alerts: bundle.alerts,
          });

          // Calculate Multi-Hazard Risks
          const risks = evaluateWeatherRisks(
            bundle.current,
            activeLocation,
            bundle.hourly,
            bundle.daily
          );
          setRiskReport(risks);

          // Calculate AI Rainfall Nowcast
          const nowcast = weatherForecastService.generateRainfallNowcast(
            activeLocation,
            bundle.current,
            bundle.hourly
          );
          setNowcastTimeline(nowcast);

          // Generate Human-in-the-Loop alert proposals from risks
          const initialProposals = generatePendingAlertApprovalsFromRisks(risks);
          setPendingApprovals(initialProposals);
        }
      } catch (err) {
        console.error('Failed to load weather data:', err);
      } finally {
        if (!isCancelled) {
          setIsLoadingWeather(false);
        }
      }
    }

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [activeLocation, isDemoMode]);

  // Handler helpers
  const handleSelectLocation = (loc: LocationData) => {
    setActiveLocation(loc);
  };

  const handleSelectRole = (role: UserRole) => {
    setActiveRole(role);
    saveStoredRole(role);
  };

  const handleSelectLanguage = (lang: SupportedLanguage) => {
    setLanguage(lang);
    saveStoredLanguage(lang);
  };

  const handleToggleDemoMode = () => {
    const nextMode = !isDemoMode;
    setIsDemoMode(nextMode);
    saveStoredDemoMode(nextMode);
  };

  const handleToggleSound = () => {
    setSoundEnabled(!soundEnabled);
  };

  const handleUpdateSavedLocations = (locs: LocationData[]) => {
    setSavedLocations(locs);
    saveSavedLocations(locs);
  };

  // Trigger preset hackathon demo scenario
  const handleTriggerScenario = (scenario: DemoScenario) => {
    setIsDemoMode(true);
    saveStoredDemoMode(true);
    setActiveLocation(scenario.location);
    setActiveRole(scenario.role);
    saveStoredRole(scenario.role);
    setLanguage(scenario.language);
    saveStoredLanguage(scenario.language);

    if (scenario.id === 'scenario-climate-trend') {
      setActiveTab('climate');
    } else if (scenario.id === 'scenario-severe-rain') {
      setActiveTab('nowcast');
    } else if (scenario.id === 'scenario-cyclone-ndrf') {
      setActiveTab('approval');
    } else {
      setActiveTab('assistant');
    }
  };

  const handleAskClimateAi = (_query: string) => {
    setActiveTab('assistant');
  };

  // Operator Alert Approval Handlers
  const handleApproveAlert = (id: string) => {
    setPendingApprovals((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'APPROVED' } : item))
    );
    const target = pendingApprovals.find((a) => a.id === id);
    if (target) {
      const logEntry: AlertAuditLogItem = {
        logId: `audit-${Date.now()}`,
        alertId: target.id,
        operator: 'Senior Disaster Duty Officer (NDRF / SDMA)',
        action: 'APPROVED',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: `Authorized for multi-channel citizen dissemination across ${target.recommendedAudience.join(', ')}. Dispatched to ${target.location.name}.`,
      };
      setAuditLog((prev) => [logEntry, ...prev]);
    }
  };

  const handleRejectAlert = (id: string, reason?: string) => {
    setPendingApprovals((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'REJECTED' } : item))
    );
    const target = pendingApprovals.find((a) => a.id === id);
    if (target) {
      const logEntry: AlertAuditLogItem = {
        logId: `audit-${Date.now()}`,
        alertId: target.id,
        operator: 'Senior Disaster Duty Officer (NDRF / SDMA)',
        action: 'REJECTED',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: reason || `Suppressed by human duty officer after local radar validation for ${target.location.name}.`,
      };
      setAuditLog((prev) => [logEntry, ...prev]);
    }
  };

  const handleEditAlert = (id: string, updatedHeadline: string, updatedBody: string) => {
    setPendingApprovals((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'EDITED_AND_APPROVED',
              draftedMessage: {
                ...item.draftedMessage,
                headline: updatedHeadline,
                body: updatedBody,
              },
            }
          : item
      )
    );
    const target = pendingApprovals.find((a) => a.id === id);
    if (target) {
      const logEntry: AlertAuditLogItem = {
        logId: `audit-${Date.now()}`,
        alertId: target.id,
        operator: 'Senior Disaster Duty Officer (NDRF / SDMA)',
        action: 'EDITED',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: `Content revised by operator for ${target.location.name}. Headline: "${updatedHeadline}".`,
      };
      setAuditLog((prev) => [logEntry, ...prev]);
    }
  };

  const handleDispatchAlertRecommendation = (hazard: RiskAssessmentItem) => {
    let alertType: WeatherAlert['type'] = 'heavy_rain';
    if (hazard.category === 'flood') alertType = 'flood';
    else if (hazard.category === 'lightning') alertType = 'lightning';
    else if (hazard.category === 'cyclone') alertType = 'cyclone';
    else if (hazard.category === 'heatwave') alertType = 'heatwave';
    else if (hazard.category === 'strong_wind') alertType = 'strong_wind';

    const newProposal: PendingAlertApproval = {
      id: `approval-${hazard.category}-${Date.now()}`,
      hazardTitle: hazard.title,
      hazardType: alertType,
      riskLevel: hazard.level,
      confidenceScore: hazard.confidenceScore,
      confidenceLevel: hazard.confidenceLevel,
      location: activeLocation,
      reasons: hazard.contributingFactors.slice(0, 4),
      recommendedAudience: ['farmers', 'urban_commuters', 'general_public'],
      recommendedChannels: ['sms', 'whatsapp', 'voice_ivr'],
      draftedMessage: {
        headline: `🚨 EMERGENCY WEATHER ALERT: ${hazard.level} ${hazard.title.toUpperCase()} (${activeLocation.name})`,
        body: `${hazard.recommendedAction} Avoid exposed areas. Dial 1070 / 112 for emergency rescue or medical aid.`,
        helpline: '1070 (SDMA) / 112 (National Emergency)',
        actionDirective: hazard.recommendedAction,
      },
      status: 'PENDING_REVIEW',
      detectedAt: new Date().toISOString(),
    };

    setPendingApprovals((prev) => [newProposal, ...prev]);
    setActiveTab('approval');
  };

  return (
    <div className="mausam-app">
      {/* Navbar Header */}
      <Navbar
        activeLocation={activeLocation}
        onSelectLocation={handleSelectLocation}
        activeRole={activeRole}
        onSelectRole={handleSelectRole}
        language={language}
        onSelectLanguage={handleSelectLanguage}
        isDemoMode={isDemoMode}
        onToggleDemoMode={handleToggleDemoMode}
        activeAlerts={alerts}
        onOpenAlertsModal={() => setActiveTab('alerts')}
        onOpenSavedLocations={() => setIsSavedLocationsOpen(true)}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        onOpenDemoModal={() => setIsDemoModalOpen(true)}
        onOpenHyperlocal={() => setIsHyperlocalModalOpen(true)}
        onOpenCitizenReport={() => setIsCitizenReportOpen(true)}
        isOfflineMode={isOfflineMode}
        onToggleOfflineMode={() => {
          const next = !isOfflineMode;
          offlineSyncService.setSimulatedOffline(next);
          setIsOfflineMode(next);
        }}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        pendingApprovalsCount={pendingApprovals.filter((p) => p.status === 'PENDING_REVIEW').length}
      />

      {/* Offline Resiliency Emergency Banner */}
      <OfflineBanner
        location={activeLocation}
        onSyncComplete={() => {
          setIsOfflineMode(false);
        }}
      />

      {/* Main Tab Routing */}
      <main className="main-app-content">
        <div className="container">
          {/* TAB 1: Home Dashboard */}
          {activeTab === 'dashboard' && (
            <>
              {/* Proactive Top-Level AI Guidance Agent (Welcome & Voice/Text Nav) */}
              <div style={{ marginBottom: '2rem' }}>
                <MausamAiGuidanceAgent
                  activeLocation={activeLocation}
                  activeRole={activeRole}
                  language={language}
                  weatherBundle={weatherBundle}
                  riskReport={riskReport}
                  onNavigateTab={setActiveTab}
                  onOpenCitizenReport={() => setIsCitizenReportOpen(true)}
                  onSelectLanguage={handleSelectLanguage}
                  soundEnabled={soundEnabled}
                />
              </div>

              <div className="dashboard-grid">
                <div className="dashboard-left-col">
                  {!isLoadingWeather && currentWeather ? (
                    <LiveWeatherHero
                      weather={currentWeather}
                      location={activeLocation}
                      language={language}
                      activeAlerts={alerts}
                      onOpenAlerts={() => setActiveTab('alerts')}
                      onOpenHyperlocal={() => setIsHyperlocalModalOpen(true)}
                    />
                  ) : (
                    <div className="skeleton-box" style={{ height: '360px' }}></div>
                  )}

                  {nowcastTimeline && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <RainfallNowcastCard
                        nowcast={nowcastTimeline}
                        location={activeLocation}
                      />
                    </div>
                  )}

                  {hourlyForecast.length > 0 && (
                    <HourlyForecastStrip hourly={hourlyForecast} />
                  )}

                  {dailyForecast.length > 0 && (
                    <SevenDayForecastCard daily={dailyForecast} />
                  )}
                </div>

                <div className="dashboard-right-col">
                  <WeatherAssistant
                    activeLocation={activeLocation}
                    activeRole={activeRole}
                    language={language}
                    isDemoMode={isDemoMode}
                    soundEnabled={soundEnabled}
                  />

                  <WeatherMap
                    activeLocation={activeLocation}
                    onSelectLocation={handleSelectLocation}
                    activeAlerts={alerts}
                  />
                </div>
              </div>
            </>
          )}

          {/* TAB: Dedicated AI Guidance Agent */}
          {activeTab === 'guide' && (
            <div style={{ maxWidth: '1050px', margin: '0 auto', paddingBottom: '2.5rem' }}>
              <MausamAiGuidanceAgent
                activeLocation={activeLocation}
                activeRole={activeRole}
                language={language}
                weatherBundle={weatherBundle}
                riskReport={riskReport}
                onNavigateTab={setActiveTab}
                onOpenCitizenReport={() => setIsCitizenReportOpen(true)}
                onSelectLanguage={handleSelectLanguage}
                soundEnabled={soundEnabled}
              />
            </div>
          )}

          {/* TAB 2: AI Rainfall Nowcast (Dedicated Horizon) */}
          {activeTab === 'nowcast' && (
            <div className="dashboard-grid">
              <div className="dashboard-left-col">
                {nowcastTimeline ? (
                  <RainfallNowcastCard
                    nowcast={nowcastTimeline}
                    location={activeLocation}
                  />
                ) : (
                  <div className="skeleton-box" style={{ height: '400px' }}></div>
                )}

                {hourlyForecast.length > 0 && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <HourlyForecastStrip hourly={hourlyForecast} />
                  </div>
                )}
              </div>

              <div className="dashboard-right-col">
                {currentWeather && (
                  <LiveWeatherHero
                    weather={currentWeather}
                    location={activeLocation}
                    language={language}
                    activeAlerts={alerts}
                    onOpenAlerts={() => setActiveTab('alerts')}
                    onOpenHyperlocal={() => setIsHyperlocalModalOpen(true)}
                  />
                )}

                <WeatherMap
                  activeLocation={activeLocation}
                  onSelectLocation={handleSelectLocation}
                  activeAlerts={alerts}
                />
              </div>
            </div>
          )}

          {/* TAB 3: Multi-Hazard Weather Risk Engine */}
          {activeTab === 'risks' && (
            <div>
              {riskReport && (
                <WeatherRiskCenter
                  riskReport={riskReport}
                  activeLocation={activeLocation}
                  currentWeather={currentWeather || undefined}
                  onDispatchAlertRecommendation={handleDispatchAlertRecommendation}
                />
              )}
            </div>
          )}

          {/* TAB 4: Geospatial Weather GIS Map */}
          {activeTab === 'map' && (
            <div>
              <WeatherMap
                activeLocation={activeLocation}
                onSelectLocation={handleSelectLocation}
                activeAlerts={alerts}
              />
              <div style={{ marginTop: '1.5rem' }}>
                {currentWeather && (
                  <LiveWeatherHero
                    weather={currentWeather}
                    location={activeLocation}
                    language={language}
                    activeAlerts={alerts}
                    onOpenAlerts={() => setActiveTab('alerts')}
                    onOpenHyperlocal={() => setIsHyperlocalModalOpen(true)}
                  />
                )}
              </div>
            </div>
          )}

          {/* TAB 5: MausamAI Copilot (Conversational Assistant) */}
          {activeTab === 'assistant' && (
            <div className="dashboard-grid">
              <div className="dashboard-left-col">
                <WeatherAssistant
                  activeLocation={activeLocation}
                  activeRole={activeRole}
                  language={language}
                  isDemoMode={isDemoMode}
                  soundEnabled={soundEnabled}
                />
              </div>

              <div className="dashboard-right-col">
                {currentWeather && (
                  <LiveWeatherHero
                    weather={currentWeather}
                    location={activeLocation}
                    language={language}
                    activeAlerts={alerts}
                    onOpenAlerts={() => setActiveTab('alerts')}
                    onOpenHyperlocal={() => setIsHyperlocalModalOpen(true)}
                  />
                )}
                {dailyForecast.length > 0 && (
                  <SevenDayForecastCard daily={dailyForecast} />
                )}
              </div>
            </div>
          )}

          {/* TAB 6: Live Weather & Synoptic Forecast */}
          {activeTab === 'forecast' && (
            <div className="dashboard-grid">
              <div className="dashboard-left-col">
                {currentWeather && (
                  <LiveWeatherHero
                    weather={currentWeather}
                    location={activeLocation}
                    language={language}
                    activeAlerts={alerts}
                    onOpenAlerts={() => setActiveTab('alerts')}
                    onOpenHyperlocal={() => setIsHyperlocalModalOpen(true)}
                  />
                )}
                {hourlyForecast.length > 0 && (
                  <HourlyForecastStrip hourly={hourlyForecast} />
                )}
              </div>

              <div className="dashboard-right-col">
                {dailyForecast.length > 0 && (
                  <SevenDayForecastCard daily={dailyForecast} />
                )}
                <WeatherMap
                  activeLocation={activeLocation}
                  onSelectLocation={handleSelectLocation}
                  activeAlerts={alerts}
                />
              </div>
            </div>
          )}

          {/* TAB 7: Alerts & Early Warnings (SurakshaAI Dispatcher) */}
          {activeTab === 'alerts' && (
            <AlertsCenter
              alerts={alerts}
              isDemoMode={isDemoMode}
              activeLocation={activeLocation}
              language={language}
            />
          )}

          {/* TAB 8: Operator Human-in-the-Loop Alert Approval */}
          {activeTab === 'approval' && (
            <AlertApprovalCenter
              pendingAlerts={pendingApprovals}
              activeLocation={activeLocation}
              onApproveAlert={(item) => handleApproveAlert(item.id)}
              onRejectAlert={(item) => handleRejectAlert(item.id)}
              onEditAlert={(item) => handleEditAlert(item.id, item.draftedMessage.headline, item.draftedMessage.body)}
              auditHistory={auditLog}
            />
          )}

          {/* TAB 9: Climate Trends & Decadal Analytics */}
          {activeTab === 'climate' && (
            <ClimateAnalytics onAskClimateAi={handleAskClimateAi} />
          )}

          {/* TAB 10: Sector Decision Advisories */}
          {activeTab === 'advisories' && currentWeather && (
            <SectorAdvisoryHub
              activeLocation={activeLocation}
              weather={currentWeather}
              initialSector={activeRole}
            />
          )}

          {/* TAB 11: What-If Weather & Disaster Scenario Simulator */}
          {activeTab === 'simulator' && (
            <ScenarioSimulator activeLocation={activeLocation} />
          )}

          {/* TAB 12: Multi-Sector Impact Estimation Engine */}
          {activeTab === 'impact' && (
            <div>
              {impactReport ? (
                <ImpactAssessmentDashboard impactReport={impactReport} />
              ) : (
                <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                  <p>Calculating multi-sector physical impact report for {activeLocation.name}...</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 13: AI Disaster Mission & Incident Command Action Planner */}
          {activeTab === 'planner' && (
            <DisasterActionPlanner
              activeLocation={activeLocation}
              primaryHazard={
                primaryHazard || {
                  category: 'heavy_rain',
                  title: 'Severe Rainfall & Flash Flooding Threat',
                  level: 'HIGH',
                  score: 78,
                  forecastHorizon: 'Next 3 Hours',
                  confidenceScore: 84,
                  confidenceLevel: 'HIGH',
                  contributingFactors: [
                    'Precipitation rate 42 mm/h exceeding municipal storm drain thresholds',
                    'High soil saturation index across low-lying terrain',
                  ],
                  recommendedAction:
                    'Deploy de-watering pumps, activate ward emergency response teams, and issue commuter travel warnings.',
                  sectorActions: {
                    farmers: ['Protect stored harvest in covered warehouses.'],
                    urbanCommuters: ['Avoid arterial low-lying underpasses and flooded intersections.'],
                  },
                  dataUsed: ['IMD Doppler Radar', 'Global GFS Model', 'Local Automated Weather Station'],
                }
              }
            />
          )}

          {/* TAB 14: Weather Event Timeline & Operational Sequence */}
          {activeTab === 'timeline' && (
            <WeatherEventTimeline location={activeLocation} />
          )}

          {/* TAB 15: Incident Replay Player */}
          {activeTab === 'replay' && (
            <IncidentReplayPlayer location={activeLocation} />
          )}

          {/* TAB 16: AI Performance & Accuracy Calibration Telemetry */}
          {activeTab === 'performance' && (
            <AiPerformanceDashboard />
          )}
        </div>
      </main>

      {/* Footer */}
      <Footer
        language={language}
        onOpenDemo={() => setIsDemoModalOpen(true)}
      />

      {/* Modals & Drawers */}
      <DemoModeModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
        onTriggerScenario={handleTriggerScenario}
      />

      <SavedLocationsDrawer
        isOpen={isSavedLocationsOpen}
        onClose={() => setIsSavedLocationsOpen(false)}
        savedLocations={savedLocations}
        activeLocation={activeLocation}
        onSelectLocation={handleSelectLocation}
        onUpdateSavedLocations={handleUpdateSavedLocations}
      />

      <HyperlocalLocationModal
        isOpen={isHyperlocalModalOpen}
        onClose={() => setIsHyperlocalModalOpen(false)}
        activeLocation={activeLocation}
        onSelectLocation={(loc) => {
          handleSelectLocation(loc);
          setIsHyperlocalModalOpen(false);
        }}
      />

      {currentWeather && (
        <ReportGeneratorModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          location={activeLocation}
          weather={currentWeather}
          daily={dailyForecast}
          alerts={alerts}
        />
      )}

      {/* Citizen Field Incident Reporting Modal */}
      <CitizenReportingModal
        isOpen={isCitizenReportOpen}
        onClose={() => setIsCitizenReportOpen(false)}
        activeLocation={activeLocation}
      />
    </div>
  );
};
export default App;
