import {Component, OnInit, inject} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {V2UpdateSettingsController} from './v2-update-settings.controller';

@Component({selector: 'v2-settings-updates', standalone: true, providers: [V2UpdateSettingsController], template: ''})
export class V2SettingsUpdatesComponent implements OnInit {
  readonly state = inject(V2UpdateSettingsController);
  ngOnInit(): void {void this.state.reload();}
}
@Component({selector: 'v2-settings-update-editor', standalone: true, providers: [V2UpdateSettingsController], template: ''})
export class V2SettingsUpdateEditorComponent implements OnInit {
  readonly state = inject(V2UpdateSettingsController);
  private readonly route = inject(ActivatedRoute);
  ngOnInit(): void {this.state.select(this.route.snapshot.paramMap.get('id') || ''); void this.state.reload();}
}
