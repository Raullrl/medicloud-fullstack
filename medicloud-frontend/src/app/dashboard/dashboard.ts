import { Component, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  @Output() cerrarSesionEvento = new EventEmitter<void>();
  
  mensajeServidor = '¡Bóveda Segura de MediCloud conectada!';
  carpetas: any[] = [];

  // ✨ AÑADIMOS EL 'cdr' PARA DESPERTAR A ANGULAR
  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.obtenerCarpetas();
  }

  obtenerCarpetas() {
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get('https://medicloud-backend-tuug.onrender.com/api/carpetas', { headers }).subscribe({
      next: (respuesta: any) => {
        // Guardamos los datos
        if (respuesta && respuesta.carpetas) {
          this.carpetas = respuesta.carpetas;
        } else if (Array.isArray(respuesta)) {
          this.carpetas = respuesta;
        }

        // 🔨 EL MARTILLAZO: Obligamos a la pantalla a actualizarse al instante
        this.cdr.detectChanges(); 
      },
      error: (err) => {
        console.error("❌ Error al obtener carpetas:", err);
      }
    });
  }

  cerrarSesion() {
    localStorage.removeItem('token_medicloud');
    this.cerrarSesionEvento.emit();
  }

  abrirCarpeta(url: string) {
    if (url) {
      window.open(url, '_blank');
    } else {
      alert("No hay archivo disponible para esta carpeta.");
    }
  }
}