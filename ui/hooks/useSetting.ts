import * as React from "react";
import { sendMessage } from "../../messaging/client";
import type { Settings } from "../../types/settings";
import type { SettingsUpdate } from "../../types/settings";
import useSettingsStore from "../store/useSettingsStore";

interface ICommand {
    name: string;
    description: string;
    shortcut: string;
}

interface IUseSetting {
    commands: ICommand[];
    loading: boolean;
    settings: Settings | null;
    refreshBtnRef: React.RefObject<HTMLButtonElement | null>;
    handleRefreshClick: () => void;
    handleChangeShortcutClick: () => void;
    updateSettings: (updates: SettingsUpdate) => Promise<void>;
}

const getCommands = (): Promise<ICommand[]> => {
    return new Promise((resolve) => {
        chrome.commands.getAll((cmds) => {
            resolve(cmds as ICommand[]);
        });
    });
};

const useSetting = (): IUseSetting => {
    // state
    const [commands, setCommands] = React.useState<ICommand[]>([]);
    const [loading, setLoading] = React.useState(false);
    const settings = useSettingsStore((s) => s.settings);
    const setSettings = useSettingsStore((s) => s.setSettings);
    // ref
    const refreshBtnRef = React.useRef<HTMLButtonElement | null>(null);

    // useEffects
    React.useEffect(() => {
        getCommands().then((cmds) => {
            setCommands(cmds);
        });
    }, []);

    React.useEffect(() => {
        const loadSettings = async () => {
            setLoading(true);
            try {
                const response = await sendMessage("GET_SETTINGS", undefined);
                setSettings(response.settings);
            } finally {
                setLoading(false);
            }
        };

        void loadSettings();
    }, [setSettings]);

    const updateSettings = React.useCallback(
        async (updates: SettingsUpdate) => {
            const response = await sendMessage("UPDATE_SETTINGS", { updates });
            setSettings(response.settings);
        },
        [setSettings]
    );

    // event handlers
    const handleRefreshClick = () => {
        getCommands().then((cmds) => {
            setCommands(cmds);
        });
    };

    // helper functions
    const handleChangeShortcutClick = () => {
        chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    };

    return {
        commands,
        loading,
        settings,
        refreshBtnRef,
        handleRefreshClick,
        handleChangeShortcutClick,
        updateSettings,
    };
};

export default useSetting;
