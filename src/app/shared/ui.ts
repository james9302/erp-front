/** One import for the Material pieces the pages use. */
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { RouterLink } from '@angular/router';
import { TableComponent } from './table';
import { Drawer } from './drawer';
import { MonthPipe, QtyPipe, RandPipe, WhenPipe } from '../core/pipes';

export const UI = [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatIconModule, MatTabsModule,
  MatProgressBarModule, MatTooltipModule, MatExpansionModule, RouterLink, TableComponent, Drawer, RandPipe, QtyPipe, WhenPipe, MonthPipe];
