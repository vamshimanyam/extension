import { Download, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import * as React from "react";
import {
    Badge,
    Box,
    Button,
    Card,
    Checkbox,
    DataList,
    Flex,
    Heading,
    IconButton,
    Kbd,
    Select,
    Separator,
    SegmentedControl,
    Slider,
    Text,
    TextField,
} from "@radix-ui/themes";
import pkg from "../../../package.json";
import { BUFFER_LIMITS, CAPTURE_LIMITS, DEFAULT_SETTINGS } from "../../../config/constants";
import { sendMessage } from "../../../messaging/client";
import type { SessionBackup } from "../../../types/backup";
import type { DashboardStats } from "../../../types/dashboard";
import type { Session } from "../../../types/session";
import type { Settings, SettingsUpdate } from "../../../types/settings";
import { buildSessionBackup, exportSessionBackupBundle } from "../../features/export/backupExporter";
import { HEADING_IDS, SETTINGS } from "../../constant";
import useSetting from "../../hooks/useSetting";
import "./style.scss";

const FlexBetween = ({ label, children }: { label: string; children: React.ReactNode }) => {
    return (
        <Flex justify="between" align="center" gap="3" wrap="wrap">
            <Box flexGrow="1" flexShrink="1" flexBasis="180px">
                <Text as="p" size="2">
                    {label}
                </Text>
            </Box>
            <Box flexGrow="1" flexShrink="1" flexBasis="190px">
                {children}
            </Box>
        </Flex>
    );
};

const SettingCheckbox = ({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) => {
    return (
        <Flex align="center" gap="2">
            <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
            <Text size="2">{label}</Text>
        </Flex>
    );
};

function formatBytes(value: number): string {
    if (!Number.isFinite(value) || value <= 0) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = value;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

function getSessionStatusColor(status: Session["status"]): "green" | "blue" | "gray" {
    if (status === "active") {
        return "green";
    }

    if (status === "completed") {
        return "blue";
    }

    return "gray";
}

async function buildBackupsForSessions(sessionIds: string[]): Promise<SessionBackup[]> {
    const backups: SessionBackup[] = [];

    for (const sessionId of sessionIds) {
        const detail = await sendMessage("GET_SESSION_DETAIL", { sessionId });
        if (!detail.session) {
            continue;
        }

        backups.push(await buildSessionBackup(detail.session, detail.steps));
    }

    return backups;
}

function StorageManagementSection() {
    const [dashboard, setDashboard] = React.useState<DashboardStats | null>(null);
    const [sessions, setSessions] = React.useState<Session[]>([]);
    const [selectedSessionIds, setSelectedSessionIds] = React.useState<Set<string>>(() => new Set());
    const [loadingStorage, setLoadingStorage] = React.useState(false);
    const [working, setWorking] = React.useState(false);
    const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

    const loadStorage = React.useCallback(async () => {
        setLoadingStorage(true);

        try {
            const [dashboardResponse, sessionListResponse] = await Promise.all([
                sendMessage("GET_DASHBOARD", undefined),
                sendMessage("GET_SESSION_LIST", undefined),
            ]);
            const availableSessionIds = new Set(sessionListResponse.sessions.map((session) => session.id));

            setDashboard(dashboardResponse.dashboard);
            setSessions(sessionListResponse.sessions);
            setSelectedSessionIds((current) => {
                return new Set(Array.from(current).filter((sessionId) => availableSessionIds.has(sessionId)));
            });
        } finally {
            setLoadingStorage(false);
        }
    }, []);

    React.useEffect(() => {
        const timeoutId = globalThis.setTimeout(() => {
            void loadStorage().catch((error) => {
                setStatusMessage(error instanceof Error ? error.message : String(error));
            });
        }, 0);

        return () => globalThis.clearTimeout(timeoutId);
    }, [loadStorage]);

    const runStorageAction = async (action: () => Promise<void>) => {
        setWorking(true);
        setStatusMessage(null);

        try {
            await action();
            await loadStorage();
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setWorking(false);
        }
    };

    const toggleSessionSelection = (sessionId: string, checked: boolean) => {
        setSelectedSessionIds((current) => {
            const next = new Set(current);

            if (checked) {
                next.add(sessionId);
                return next;
            }

            next.delete(sessionId);
            return next;
        });
    };

    const handleExportBackups = async () => {
        const selectedIds = Array.from(selectedSessionIds);
        const sessionIds = selectedIds.length > 0 ? selectedIds : sessions.map((session) => session.id);

        if (sessionIds.length === 0) {
            setStatusMessage("No sessions available to export.");
            return;
        }

        await runStorageAction(async () => {
            const backups = await buildBackupsForSessions(sessionIds);
            if (backups.length === 0) {
                throw new Error("No session backups could be created.");
            }

            exportSessionBackupBundle(backups);
            setStatusMessage(`Exported ${backups.length} session backup${backups.length === 1 ? "" : "s"}.`);
        });
    };

    const handleDeleteSelected = async () => {
        const sessionIds = Array.from(selectedSessionIds);
        if (sessionIds.length === 0) {
            setStatusMessage("Select at least one session to delete.");
            return;
        }

        const confirmed = globalThis.confirm(`Delete ${sessionIds.length} selected session${sessionIds.length === 1 ? "" : "s"}? This removes their steps and screenshots.`);
        if (!confirmed) {
            return;
        }

        await runStorageAction(async () => {
            for (const sessionId of sessionIds) {
                await sendMessage("DELETE_SESSION", { sessionId });
            }

            setSelectedSessionIds(new Set());
            setStatusMessage(`Deleted ${sessionIds.length} selected session${sessionIds.length === 1 ? "" : "s"}.`);
        });
    };

    const handleDeleteCompleted = async () => {
        const completedSessionIds = sessions
            .filter((session) => session.status === "completed")
            .map((session) => session.id);

        if (completedSessionIds.length === 0) {
            setStatusMessage("No completed sessions to delete.");
            return;
        }

        const confirmed = globalThis.confirm(`Delete ${completedSessionIds.length} completed session${completedSessionIds.length === 1 ? "" : "s"}?`);
        if (!confirmed) {
            return;
        }

        await runStorageAction(async () => {
            for (const sessionId of completedSessionIds) {
                await sendMessage("DELETE_SESSION", { sessionId });
            }

            setSelectedSessionIds((current) => {
                return new Set(Array.from(current).filter((sessionId) => !completedSessionIds.includes(sessionId)));
            });
            setStatusMessage(`Deleted ${completedSessionIds.length} completed session${completedSessionIds.length === 1 ? "" : "s"}.`);
        });
    };

    const handleClearAllData = async () => {
        if (sessions.length === 0) {
            setStatusMessage("No captured session data to clear.");
            return;
        }

        const firstConfirmation = globalThis.confirm("Clear all captured session data? Settings will be kept, but sessions, steps, and screenshots will be deleted.");
        if (!firstConfirmation) {
            return;
        }

        const finalConfirmation = globalThis.confirm("Final confirmation: permanently delete every session backup source in this browser?");
        if (!finalConfirmation) {
            return;
        }

        await runStorageAction(async () => {
            for (const session of sessions) {
                await sendMessage("DELETE_SESSION", { sessionId: session.id });
            }

            setSelectedSessionIds(new Set());
            setStatusMessage(`Cleared ${sessions.length} session${sessions.length === 1 ? "" : "s"}.`);
        });
    };

    const sessionRows = dashboard?.sessionStats ?? sessions.map((session) => ({
        id: session.id,
        name: session.name,
        status: session.status,
        updatedAt: session.updatedAt,
        stepCount: session.stepCount,
        sizeBytes: 0,
    }));
    const selectedCount = selectedSessionIds.size;
    const completedCount = sessions.filter((session) => session.status === "completed").length;
    const storagePercent = Math.min(100, dashboard?.storageEstimate?.percentUsed ?? 0);
    const usedBytes = dashboard?.storageEstimate?.usageBytes ?? dashboard?.totalEstimatedBytes ?? 0;
    const quotaBytes = dashboard?.storageEstimate?.quotaBytes ?? 0;

    return (
        <SettingsSection title="Storage">
            <Flex direction="column" gap="3">
                <Flex justify="between" align="center" gap="2" wrap="wrap">
                    <Box>
                        <Text size="2" weight="medium">
                            {formatBytes(usedBytes)} used{quotaBytes > 0 ? ` of ${formatBytes(quotaBytes)}` : " estimated"}
                        </Text>
                        <Text as="p" size="1" color="gray">
                            {dashboard?.sessionsTotal ?? sessions.length} sessions, {dashboard?.stepsTotal ?? 0} steps, {dashboard?.screenshotsTotal ?? 0} screenshots
                        </Text>
                    </Box>
                    <Button variant="soft" color="gray" onClick={() => void loadStorage()} loading={loadingStorage} disabled={working}>
                        <RefreshCw size={14} />
                        Refresh
                    </Button>
                </Flex>

                <Box className="storage-meter" aria-label={`Storage usage ${storagePercent}%`}>
                    <Box className="storage-meter-fill" style={{ width: `${storagePercent}%` }} />
                </Box>

                {dashboard && (
                    <DataList.Root>
                        {dashboard.storeStats.map((store) => (
                            <DataList.Item key={store.storeName}>
                                <DataList.Label>{store.storeName}</DataList.Label>
                                <DataList.Value>
                                    {store.count} records - {formatBytes(store.sizeBytes)}
                                </DataList.Value>
                            </DataList.Item>
                        ))}
                    </DataList.Root>
                )}

                <Flex justify="between" align="center" gap="2" wrap="wrap">
                    <Text size="2" weight="medium">
                        Sessions {selectedCount > 0 ? `(${selectedCount} selected)` : ""}
                    </Text>
                    <Flex gap="2" wrap="wrap">
                        <Button variant="soft" onClick={() => void handleExportBackups()} disabled={working || loadingStorage || sessions.length === 0}>
                            <Download size={14} />
                            {selectedCount > 0 ? "Export Selected" : "Export All"}
                        </Button>
                        <Button variant="soft" color="orange" onClick={() => void handleDeleteCompleted()} disabled={working || loadingStorage || completedCount === 0}>
                            <Trash2 size={14} />
                            Delete Completed
                        </Button>
                        <Button variant="soft" color="red" onClick={() => void handleDeleteSelected()} disabled={working || loadingStorage || selectedCount === 0}>
                            <Trash2 size={14} />
                            Delete Selected
                        </Button>
                    </Flex>
                </Flex>

                <Box className="storage-session-list">
                    {sessionRows.length === 0 ? (
                        <Text size="2" color="gray">
                            No sessions stored yet.
                        </Text>
                    ) : (
                        sessionRows.map((session) => (
                            <Flex key={session.id} align="center" gap="2" className="storage-session-row">
                                <Checkbox
                                    checked={selectedSessionIds.has(session.id)}
                                    onCheckedChange={(checked) => toggleSessionSelection(session.id, checked === true)}
                                    aria-label={`Select ${session.name}`}
                                />
                                <Box flexGrow="1" className="storage-session-main">
                                    <Text size="2" weight="medium" className="storage-session-name">
                                        {session.name}
                                    </Text>
                                    <Text as="p" size="1" color="gray">
                                        Updated {new Date(session.updatedAt).toLocaleString()}
                                    </Text>
                                </Box>
                                <Flex gap="2" align="center" wrap="wrap" justify="end">
                                    <Badge color={getSessionStatusColor(session.status)} variant="soft">
                                        {session.status.toUpperCase()}
                                    </Badge>
                                    <Badge color="gray" variant="soft">
                                        {session.stepCount} steps
                                    </Badge>
                                    <Text size="1" color="gray">
                                        {formatBytes(session.sizeBytes)}
                                    </Text>
                                </Flex>
                            </Flex>
                        ))
                    )}
                </Box>

                <Flex justify="between" align="center" gap="2" wrap="wrap">
                    <Text size="1" color={statusMessage?.toLowerCase().includes("failed") ? "red" : "gray"}>
                        {statusMessage ?? (working ? "Working on storage action..." : "JSON backups include screenshots for portability.")}
                    </Text>
                    <Button variant="soft" color="red" onClick={() => void handleClearAllData()} disabled={working || loadingStorage || sessions.length === 0}>
                        <Trash2 size={14} />
                        Clear All Data
                    </Button>
                </Flex>
            </Flex>
        </SettingsSection>
    );
}

export function SettingsPanel() {
    const {
        commands,
        loading,
        settings: savedSettings,
        refreshBtnRef,
        handleRefreshClick,
        handleChangeShortcutClick,
        updateSettings,
    } = useSetting();
    const settings = savedSettings ?? DEFAULT_SETTINGS;

    const updateSection = <Section extends keyof Settings>(
        section: Section,
        updates: Partial<Settings[Section]>
    ) => {
        void updateSettings({ [section]: updates } as SettingsUpdate);
    };

    const shortcutCounts = commands.reduce<Record<string, number>>((accumulator, command) => {
        if (!command.shortcut) {
            return accumulator;
        }

        accumulator[command.shortcut] = (accumulator[command.shortcut] ?? 0) + 1;
        return accumulator;
    }, {});

    const conflictingShortcuts = Object.entries(shortcutCounts)
        .filter(([, count]) => count > 1)
        .map(([shortcut]) => shortcut);

    return (
        <section className="settings-container" aria-labelledby={HEADING_IDS.settings}>
            <Flex justify="between" align="center" gap="2">
                <Heading size="5" as="h1">
                    {SETTINGS.heading}
                </Heading>
                <Badge color="gray" aria-label={`Version: ${pkg.version}`}>
                    v{pkg.version}
                </Badge>
            </Flex>

            <Box pt="1" />
            <Separator size="4" />
            <Box pt="4" />

            <Card>
                <Heading size="3" as="h2">
                    {SETTINGS.keyboardShortcuts}
                </Heading>
                <Text as="p" size="1" color="gray" mt="2">
                    {SETTINGS.keyboardShortcutsDescription}
                </Text>

                {conflictingShortcuts.length > 0 && (
                    <Text as="p" size="1" color="red" mt="2">
                        Conflicting shortcuts detected: {conflictingShortcuts.join(", ")}. Update them in Chrome shortcuts.
                    </Text>
                )}

                <DataList.Root mt="4">
                    {commands.map((cmd) => {
                        if (cmd.name === "_execute_action") {
                            return null;
                        }

                        return (
                            <DataList.Item key={cmd.name}>
                                <DataList.Label>{cmd.description}</DataList.Label>
                                {cmd.shortcut ? (
                                    <Kbd className="shortcut-kbd" aria-label={`Shortcut: ${cmd.shortcut}`}>
                                        {cmd.shortcut}
                                    </Kbd>
                                ) : (
                                    <Badge color="orange" variant="surface">
                                        Unassigned
                                    </Badge>
                                )}
                            </DataList.Item>
                        );
                    })}
                </DataList.Root>

                <Box pt="4" />
                <Flex justify="between" align="center">
                    <Button variant="ghost" onClick={handleChangeShortcutClick}>
                        {SETTINGS.changeShortcutsBtn}
                        <ExternalLink size={16} aria-label=", opens in a new tab" />
                    </Button>
                    <IconButton ref={refreshBtnRef} onClick={handleRefreshClick} aria-label="Refresh shortcuts">
                        <RefreshCw size={16} aria-hidden="true" />
                    </IconButton>
                </Flex>
            </Card>

            <SettingsSection title={SETTINGS.capture} loading={loading}>
                <FlexBetween label={SETTINGS.imageFormat}>
                    <SegmentedControl.Root
                        size="1"
                        variant="classic"
                        value={settings.capture.format}
                        onValueChange={(value) => updateSection("capture", { format: value as "webp" | "png" })}
                    >
                        <SegmentedControl.Item value="webp">{SETTINGS.imageFormatOptions.webp}</SegmentedControl.Item>
                        <SegmentedControl.Item value="png">{SETTINGS.imageFormatOptions.png}</SegmentedControl.Item>
                    </SegmentedControl.Root>
                </FlexBetween>

                <FlexBetween label={SETTINGS.imageQuality}>
                    <Flex justify="start" align="center" gap="2">
                        <Box flexGrow="1">
                            <Slider
                                value={[settings.capture.quality]}
                                min={CAPTURE_LIMITS.qualityMin}
                                max={CAPTURE_LIMITS.qualityMax}
                                step={1}
                                aria-label={SETTINGS.imageQuality}
                                onValueChange={(value) => updateSection("capture", { quality: value[0] ?? CAPTURE_LIMITS.qualityDefault })}
                            />
                        </Box>
                        <Text as="span" size="1">
                            {settings.capture.quality}%
                        </Text>
                    </Flex>
                </FlexBetween>

                <FlexBetween label={SETTINGS.regionModeDefault}>
                    <SegmentedControl.Root
                        size="1"
                        variant="classic"
                        value={settings.capture.regionModeDefault}
                        onValueChange={(value) => updateSection("capture", { regionModeDefault: value as "silent" | "ask" })}
                    >
                        <SegmentedControl.Item value="silent">
                            {SETTINGS.regionModeDefaultOptions.silent}
                        </SegmentedControl.Item>
                        <SegmentedControl.Item value="ask">{SETTINGS.regionModeDefaultOptions.ask}</SegmentedControl.Item>
                    </SegmentedControl.Root>
                </FlexBetween>
            </SettingsSection>

            <SettingsSection title="Buffers">
                <BufferSlider
                    label="Network entries"
                    value={settings.buffers.networkMax}
                    onChange={(networkMax) => updateSection("buffers", { networkMax })}
                />
                <BufferSlider
                    label="Console entries"
                    value={settings.buffers.consoleMax}
                    onChange={(consoleMax) => updateSection("buffers", { consoleMax })}
                />
            </SettingsSection>

            <SettingsSection title="Session Defaults">
                <FlexBetween label="Auto-name format">
                    <TextField.Root
                        key={`auto-name-${settings.session.autoNameFormat}`}
                        defaultValue={settings.session.autoNameFormat}
                        onBlur={(event) => updateSection("session", { autoNameFormat: event.currentTarget.value })}
                    />
                </FlexBetween>
                <FlexBetween label="Environment">
                    <TextField.Root
                        key={`environment-${settings.session.defaultEnvironment}`}
                        defaultValue={settings.session.defaultEnvironment}
                        placeholder="staging"
                        onBlur={(event) => updateSection("session", { defaultEnvironment: event.currentTarget.value })}
                    />
                </FlexBetween>
                <FlexBetween label="Tester name">
                    <TextField.Root
                        key={`tester-${settings.session.defaultTesterName}`}
                        defaultValue={settings.session.defaultTesterName}
                        placeholder="QA tester"
                        onBlur={(event) => updateSection("session", { defaultTesterName: event.currentTarget.value })}
                    />
                </FlexBetween>
            </SettingsSection>

            <SettingsSection title="Export Defaults">
                <FlexBetween label="Default format">
                    <SegmentedControl.Root
                        size="1"
                        variant="classic"
                        value={settings.export.defaultFormat}
                        onValueChange={(value) => updateSection("export", { defaultFormat: value as "docx" | "pdf" })}
                    >
                        <SegmentedControl.Item value="docx">DOCX</SegmentedControl.Item>
                        <SegmentedControl.Item value="pdf">PDF</SegmentedControl.Item>
                    </SegmentedControl.Root>
                </FlexBetween>

                <FlexBetween label="Page size">
                    <SegmentedControl.Root
                        size="1"
                        variant="classic"
                        value={settings.export.pageSize}
                        onValueChange={(value) => updateSection("export", { pageSize: value as "A4" | "Letter" })}
                    >
                        <SegmentedControl.Item value="A4">A4</SegmentedControl.Item>
                        <SegmentedControl.Item value="Letter">Letter</SegmentedControl.Item>
                    </SegmentedControl.Root>
                </FlexBetween>

                <FlexBetween label="Report template">
                    <Select.Root
                        value={settings.export.reportTemplate}
                        onValueChange={(value) => updateSection("export", { reportTemplate: value as Settings["export"]["reportTemplate"] })}
                    >
                        <Select.Trigger />
                        <Select.Content>
                            <Select.Item value="standard">Standard</Select.Item>
                            <Select.Item value="bug-report">Bug report</Select.Item>
                            <Select.Item value="handoff">Handoff</Select.Item>
                        </Select.Content>
                    </Select.Root>
                </FlexBetween>

                <Flex direction="column" gap="2">
                    <SettingCheckbox label="Include PASS steps" checked={settings.export.includePassSteps} onChange={(includePassSteps) => updateSection("export", { includePassSteps })} />
                    <SettingCheckbox label="Include screenshots" checked={settings.export.includeScreenshots} onChange={(includeScreenshots) => updateSection("export", { includeScreenshots })} />
                    <SettingCheckbox label="Include summary table" checked={settings.export.includeSummaryTable} onChange={(includeSummaryTable) => updateSection("export", { includeSummaryTable })} />
                    <SettingCheckbox label="Include timestamps" checked={settings.export.includeTimestamps} onChange={(includeTimestamps) => updateSection("export", { includeTimestamps })} />
                    <SettingCheckbox label="Include URLs" checked={settings.export.includeUrls} onChange={(includeUrls) => updateSection("export", { includeUrls })} />
                    <SettingCheckbox label="Include technical data" checked={settings.export.includeTechData} onChange={(includeTechData) => updateSection("export", { includeTechData })} />
                </Flex>
            </SettingsSection>

            <StorageManagementSection />

            <SettingsSection title="Smart Capture">
                <Flex direction="column" gap="2">
                    <SettingCheckbox label="Auto-capture console errors" checked={settings.smartCapture.autoCaptureConsoleErrors} onChange={(autoCaptureConsoleErrors) => updateSection("smartCapture", { autoCaptureConsoleErrors })} />
                    <SettingCheckbox label="Auto-capture completed navigations" checked={settings.smartCapture.autoCaptureNavigation} onChange={(autoCaptureNavigation) => updateSection("smartCapture", { autoCaptureNavigation })} />
                </Flex>
            </SettingsSection>

            <SettingsSection title="Team Handoff">
                <FlexBetween label="Jira base URL">
                    <TextField.Root
                        key={`jira-url-${settings.integrations.jiraBaseUrl}`}
                        defaultValue={settings.integrations.jiraBaseUrl}
                        placeholder="https://company.atlassian.net"
                        onBlur={(event) => updateSection("integrations", { jiraBaseUrl: event.currentTarget.value })}
                    />
                </FlexBetween>
                <FlexBetween label="Jira project key">
                    <TextField.Root
                        key={`jira-project-${settings.integrations.jiraProjectKey}`}
                        defaultValue={settings.integrations.jiraProjectKey}
                        placeholder="QA"
                        onBlur={(event) => updateSection("integrations", { jiraProjectKey: event.currentTarget.value })}
                    />
                </FlexBetween>
                <FlexBetween label="Slack channel label">
                    <TextField.Root
                        key={`slack-channel-${settings.integrations.slackChannel}`}
                        defaultValue={settings.integrations.slackChannel}
                        placeholder="#qa-triage"
                        onBlur={(event) => updateSection("integrations", { slackChannel: event.currentTarget.value })}
                    />
                </FlexBetween>
            </SettingsSection>

            <SettingsSection title="Interface">
                <FlexBetween label="Theme">
                    <Select.Root value={settings.ui.theme} onValueChange={(value) => updateSection("ui", { theme: value as Settings["ui"]["theme"] })}>
                        <Select.Trigger />
                        <Select.Content>
                            <Select.Item value="light">Light</Select.Item>
                            <Select.Item value="dark">Dark</Select.Item>
                            <Select.Item value="system">System</Select.Item>
                        </Select.Content>
                    </Select.Root>
                </FlexBetween>
                <FlexBetween label="Timeline layout">
                    <SegmentedControl.Root
                        size="1"
                        variant="classic"
                        value={settings.ui.timelineLayout}
                        onValueChange={(value) => updateSection("ui", { timelineLayout: value as Settings["ui"]["timelineLayout"] })}
                    >
                        <SegmentedControl.Item value="vertical">Vertical</SegmentedControl.Item>
                        <SegmentedControl.Item value="grid">Grid</SegmentedControl.Item>
                    </SegmentedControl.Root>
                </FlexBetween>
                <FlexBetween label="Thumbnail size">
                    <Select.Root value={settings.ui.thumbnailSize} onValueChange={(value) => updateSection("ui", { thumbnailSize: value as Settings["ui"]["thumbnailSize"] })}>
                        <Select.Trigger />
                        <Select.Content>
                            <Select.Item value="small">Small</Select.Item>
                            <Select.Item value="medium">Medium</Select.Item>
                            <Select.Item value="large">Large</Select.Item>
                        </Select.Content>
                    </Select.Root>
                </FlexBetween>
            </SettingsSection>
        </section>
    );
}

function SettingsSection({ title, loading, children }: { title: string; loading?: boolean; children: React.ReactNode }) {
    return (
        <>
            <Box pt="4" />
            <Separator size="4" />
            <Box pt="4" />
            <Card>
                <Flex direction="column" gap="3">
                    <Heading size="3" as="h2">
                        {title}
                    </Heading>
                    {loading && (
                        <Text as="p" size="1" color="gray">
                            Loading settings...
                        </Text>
                    )}
                    {children}
                </Flex>
            </Card>
        </>
    );
}

function BufferSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
    return (
        <FlexBetween label={label}>
            <Flex justify="start" align="center" gap="2">
                <Box flexGrow="1">
                    <Slider
                        value={[value]}
                        min={BUFFER_LIMITS.min}
                        max={BUFFER_LIMITS.max}
                        step={1}
                        aria-label={label}
                        onValueChange={(nextValue) => onChange(nextValue[0] ?? BUFFER_LIMITS.default)}
                    />
                </Box>
                <Text as="span" size="1">
                    {value}
                </Text>
            </Flex>
        </FlexBetween>
    );
}
