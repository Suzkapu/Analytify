import {Location} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Inject,
  OnDestroy,
  OnInit,
  ViewChild,
  signal
} from '@angular/core';
import {ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet} from '@angular/router';
import {filter, Subscription} from 'rxjs';

import {DESIGN_VARIANT, DesignVariant} from '@core/navigation/design-variant';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {
  DesignV2NavigationItem,
  mobileDesignV2Navigation,
  primaryDesignV2Navigation,
  toolDesignV2Navigation
} from '@core/navigation/design-v2-navigation.model';
import {deepestDesignV2RouteData, DesignV2PageWidth} from '@core/navigation/design-v2-route-data';
import {SharedModule} from '@shared/shared.module';
import {AmbientBackgroundComponent} from '@shared/ambient/ambient-background.component';

interface DesignV2PageContext {
  pageId: string;
  title: string;
  width: DesignV2PageWidth;
  ambientKey: string;
  showBack: boolean;
}

const DEFAULT_CONTEXT: DesignV2PageContext = {
  pageId: 'analytify', title: 'Analytify', width: 'standard', ambientKey: 'default', showBack: false
};

@Component({
  selector: 'app-design-v2-shell',
  templateUrl: './design-v2-shell.component.html',
  styleUrls: ['./design-v2-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterLink, RouterOutlet, SharedModule, AmbientBackgroundComponent]
})
export class DesignV2ShellComponent implements OnInit, OnDestroy {
  @ViewChild('mainContent') private mainContent?: ElementRef<HTMLElement>;

  readonly primaryNavigation = primaryDesignV2Navigation();
  readonly toolNavigation = toolDesignV2Navigation();
  readonly mobileNavigation = mobileDesignV2Navigation();
  readonly pageContext = signal<DesignV2PageContext>(DEFAULT_CONTEXT);
  readonly currentUrl = signal('');
  readonly toolsOpen = signal(false);
  readonly overlayHostActive = signal(false);

  private readonly subscriptions = new Subscription();
  private hasRenderedRoute = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly location: Location,
    readonly navigation: DesignNavigationService,
    @Inject(DESIGN_VARIANT) readonly designVariant: DesignVariant
  ) {}

  ngOnInit(): void {
    this.currentUrl.set(this.router.url);
    this.applyRouteContext();
    this.subscriptions.add(this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe(event => {
      this.currentUrl.set(event.urlAfterRedirects);
      this.toolsOpen.set(false);
      this.applyRouteContext();
      if (this.hasRenderedRoute) setTimeout(() => this.mainContent?.nativeElement.focus({preventScroll: true}));
      this.hasRenderedRoute = true;
    }));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  linkFor(item: DesignV2NavigationItem): string[] {
    return this.navigation.commands(item.destination);
  }

  isActive(item: DesignV2NavigationItem): boolean {
    const destination = this.navigation.url(item.destination);
    const current = this.currentUrl().split(/[?#]/, 1)[0];
    return current === destination || current.startsWith(`${destination}/`);
  }

  back(): void {
    this.location.back();
  }

  toggleTools(): void {
    this.toolsOpen.update(open => !open);
  }

  closeTools(): void {
    this.toolsOpen.set(false);
  }

  private applyRouteContext(): void {
    const data = deepestDesignV2RouteData(this.route.snapshot);
    this.pageContext.set({
      pageId: typeof data.pageId === 'string' ? data.pageId : DEFAULT_CONTEXT.pageId,
      title: typeof data.mobileTitle === 'string' ? data.mobileTitle : DEFAULT_CONTEXT.title,
      width: data.pageWidth === 'wide' || data.pageWidth === 'full' ? data.pageWidth : 'standard',
      ambientKey: typeof data.ambientKey === 'string' ? data.ambientKey : DEFAULT_CONTEXT.ambientKey,
      showBack: data.mobileBack === true
    });
  }
}
