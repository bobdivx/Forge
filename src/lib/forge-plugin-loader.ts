import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BuiltinToolDefinition } from './forge-tool-catalog';

export interface ForgePlugin {
  name: string;
  version: string;
  tools?: BuiltinToolDefinition[];
  initialize?: () => Promise<void>;
  shutdown?: () => Promise<void>;
}

export class PluginLoader {
  private plugins: Map<string, ForgePlugin> = new Map();
  private loadedTools: BuiltinToolDefinition[] = [];

  constructor(private pluginDirectory: string) {}

  public async loadPlugins(): Promise<void> {
    try {
      const files = await readdir(this.pluginDirectory, { withFileTypes: true });
      
      for (const file of files) {
        if (file.isFile() && (file.name.endsWith('.js') || file.name.endsWith('.mjs'))) {
          const filePath = join(this.pluginDirectory, file.name);
          const fileUrl = pathToFileURL(filePath).href;
          
          try {
            const mod = await import(fileUrl);
            const plugin: ForgePlugin = mod.default || mod;
            
            if (plugin && plugin.name) {
              this.plugins.set(plugin.name, plugin);
              if (plugin.initialize) {
                await plugin.initialize();
              }
              if (plugin.tools && Array.isArray(plugin.tools)) {
                this.loadedTools.push(...plugin.tools);
              }
              console.log(`Plugin '${plugin.name}' loaded successfully.`);
            }
          } catch (err) {
            console.error(`Failed to load plugin from ${file.name}:`, err);
          }
        }
      }
    } catch (err) {
      console.warn(`Could not read plugin directory ${this.pluginDirectory}:`, err);
    }
  }

  public getTools(): BuiltinToolDefinition[] {
    return this.loadedTools;
  }

  public async shutdownAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.shutdown) {
        try {
          await plugin.shutdown();
        } catch (err) {
          console.error(`Error shutting down plugin '${plugin.name}':`, err);
        }
      }
    }
  }
}
