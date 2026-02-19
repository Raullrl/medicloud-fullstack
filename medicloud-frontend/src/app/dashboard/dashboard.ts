import { Component, Output, EventEmitter, OnInit } from '@angular/core';
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

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.obtenerCarpetas();
  }

  obtenerCarpetas() {
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get('https://medicloud-backend-tuug.onrender.com/api/carpetas', { headers }).subscribe({
      next: (respuesta: any) => {
        console.log("🕵️‍♂️ DATOS RECIBIDOS DEL BACKEND:", respuesta);
        
        // ✨ EL CÓDIGO ATRAPA-TODO: 
        // Angular buscará la lista de carpetas en todas las formas posibles
        if (Array.isArray(respuesta)) {
          this.carpetas = respuesta; // Si es una lista directa
        } else if (respuesta && Array.isArray(respuesta.carpetas)) {
          this.carpetas = respuesta.carpetas; // Si viene dentro de la variable 'carpetas'
        } else if (respuesta && Array.isArray(respuesta.data)) {
          this.carpetas = respuesta.data; // Si el backend usa 'data'
        } else {
          console.warn("⚠️ Los datos llegaron, pero no parecen una lista:", respuesta);
          this.carpetas = []; 
        }
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