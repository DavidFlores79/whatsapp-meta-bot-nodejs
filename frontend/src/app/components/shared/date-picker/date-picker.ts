import { Component, Input, Output, EventEmitter, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './date-picker.html',
  styleUrls: ['./date-picker.css']
})
export class DatePickerComponent implements OnInit {
  @Input() label: string = '';
  @Input() value: string = '';
  @Input() placeholder: string = 'Select date';
  @Input() minDate: string = '';
  @Input() maxDate: string = '';
  @Output() valueChange = new EventEmitter<string>();
  @ViewChild('calendar') calendar!: ElementRef;

  showCalendar = false;
  currentMonth: Date = new Date();
  selectedDate: Date | null = null;
  weeks: Array<Array<Date | null>> = [];

  monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  ngOnInit() {
    if (this.value) {
      this.selectedDate = new Date(this.value);
      this.currentMonth = new Date(this.selectedDate);
    }
    this.generateCalendar();
  }

  toggleCalendar() {
    this.showCalendar = !this.showCalendar;
    if (this.showCalendar) {
      this.generateCalendar();
    }
  }

  generateCalendar() {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();

    this.weeks = [];
    let currentWeek: Array<Date | null> = [];

    // Fill in empty cells before the first day
    for (let i = 0; i < startingDayOfWeek; i++) {
      currentWeek.push(null);
    }

    // Fill in the days of the month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      if (currentWeek.length === 7) {
        this.weeks.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(new Date(year, month, day));
    }

    // Fill in remaining cells
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    if (currentWeek.length > 0) {
      this.weeks.push(currentWeek);
    }
  }

  previousMonth() {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() - 1,
      1
    );
    this.generateCalendar();
  }

  nextMonth() {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + 1,
      1
    );
    this.generateCalendar();
  }

  selectDate(date: Date | null) {
    if (!date) return;

    // Check if date is within min/max range
    if (this.minDate) {
      const min = new Date(this.minDate);
      if (date < min) return;
    }
    if (this.maxDate) {
      const max = new Date(this.maxDate);
      if (date > max) return;
    }

    this.selectedDate = date;
    const formattedDate = this.formatDateForInput(date);
    this.value = formattedDate;
    this.valueChange.emit(formattedDate);
    this.showCalendar = false;
  }

  formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatDateForDisplay(date: Date | null): string {
    if (!date) return '';
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    };
    return date.toLocaleDateString(undefined, options);
  }

  isSelected(date: Date | null): boolean {
    if (!date || !this.selectedDate) return false;
    return date.toDateString() === this.selectedDate.toDateString();
  }

  isToday(date: Date | null): boolean {
    if (!date) return false;
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  isDisabled(date: Date | null): boolean {
    if (!date) return true;

    if (this.minDate) {
      const min = new Date(this.minDate);
      min.setHours(0, 0, 0, 0);
      if (date < min) return true;
    }

    if (this.maxDate) {
      const max = new Date(this.maxDate);
      max.setHours(23, 59, 59, 999);
      if (date > max) return true;
    }

    return false;
  }

  clearDate() {
    this.selectedDate = null;
    this.value = '';
    this.valueChange.emit('');
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    if (this.showCalendar && this.calendar) {
      const clickedInside = this.calendar.nativeElement.contains(event.target);
      if (!clickedInside) {
        this.showCalendar = false;
      }
    }
  }

  goToToday() {
    const today = new Date();
    this.currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    this.generateCalendar();
    this.selectDate(today);
  }
}
