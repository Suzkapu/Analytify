import {Injectable} from '@angular/core';

import {AdminService} from '@core/admin/admin.service';
import {SiteSettings} from '@core/admin/admin.models';

@Injectable({providedIn: 'root'})
export class SiteSettingsService {
  private cached: SiteSettings | null = null;

  constructor(private admin: AdminService) {}

  async load(refresh = false): Promise<SiteSettings> {
    if (!this.cached || refresh) this.cached = await this.admin.loadSiteSettings();
    return this.cached;
  }
}
