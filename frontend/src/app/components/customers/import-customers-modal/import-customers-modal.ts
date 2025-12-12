import { Component, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../../services/customer';

interface ImportResult {
  success: boolean;
  message: string;
  results: {
    total: number;
    imported: number;
    updated: number;
    duplicates: number;
    failed: number;
  };
  details?: {
    success: any[];
    updated: any[];
    duplicates: any[];
    failed: any[];
  };
}

@Component({
  selector: 'app-import-customers-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './import-customers-modal.html',
  styleUrls: ['./import-customers-modal.css']
})
export class ImportCustomersModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() imported = new EventEmitter<void>();

  // Upload state
  selectedFile: File | null = null;
  updateExisting = false;
  isDragging = false;

  // Import state
  isImporting = false;
  importComplete = false;
  importResult: ImportResult | null = null;
  error: string | null = null;

  // UI state
  showDetails = false;
  activeTab: 'success' | 'updated' | 'duplicates' | 'failed' = 'success';

  constructor(
    private customerService: CustomerService,
    private cdr: ChangeDetectorRef
  ) {}

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.handleFile(event.dataTransfer.files[0]);
    }
  }

  handleFile(file: File) {
    // Validate file type
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];

    const validExtensions = /\.(xlsx|xls|csv)$/i;

    if (!validTypes.includes(file.type) && !validExtensions.test(file.name)) {
      this.error = 'Invalid file type. Please upload an XLSX, XLS, or CSV file.';
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      this.error = 'File size exceeds 5MB limit. Please upload a smaller file.';
      return;
    }

    this.selectedFile = file;
    this.error = null;
    this.cdr.detectChanges();
  }

  removeFile() {
    this.selectedFile = null;
    this.error = null;
  }

  downloadTemplate() {
    this.customerService.downloadImportTemplate().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'customer_import_template.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      },
      error: (err) => {
        console.error('Error downloading template:', err);
        this.error = 'Failed to download template';
      }
    });
  }

  startImport() {
    if (!this.selectedFile) {
      this.error = 'Please select a file first';
      return;
    }

    this.isImporting = true;
    this.error = null;

    this.customerService.importCustomersFromFile(this.selectedFile, this.updateExisting).subscribe({
      next: (result) => {
        console.log('Import result:', result);
        this.importResult = result;
        this.isImporting = false;
        this.importComplete = true;

        // Auto-select appropriate tab based on results
        if (result.results.failed > 0) {
          this.activeTab = 'failed';
        } else if (result.results.duplicates > 0) {
          this.activeTab = 'duplicates';
        } else if (result.results.updated > 0) {
          this.activeTab = 'updated';
        } else {
          this.activeTab = 'success';
        }

        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Import error:', err);
        this.error = err.error?.error || 'Failed to import customers';
        this.isImporting = false;
        this.cdr.detectChanges();
      }
    });
  }

  finishImport() {
    this.imported.emit();
    this.closeModal();
  }

  reset() {
    this.selectedFile = null;
    this.updateExisting = false;
    this.isImporting = false;
    this.importComplete = false;
    this.importResult = null;
    this.error = null;
    this.showDetails = false;
    this.activeTab = 'success';
  }

  closeModal() {
    this.close.emit();
  }

  getFileIcon(filename: string): string {
    if (filename.endsWith('.csv')) return 'fa-file-csv';
    if (filename.endsWith('.xls')) return 'fa-file-excel';
    if (filename.endsWith('.xlsx')) return 'fa-file-excel';
    return 'fa-file';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  getProgressPercentage(): number {
    if (!this.importResult) return 0;
    const { total, imported, updated } = this.importResult.results;
    return Math.round(((imported + updated) / total) * 100);
  }
}
