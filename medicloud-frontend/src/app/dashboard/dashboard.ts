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
  
  // ✨ AQUÍ ESTÁ LA LÍNEA QUE FALTABA:
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
      next: (data: any) => {
        this.carpetas = data;
      },
      error: (err) => {
        console.error("Error al obtener carpetas", err);
      }
    });
  }

  cerrarSesion() {
    localStorage.removeItem('token_medicloud');
    this.cerrarSesionEvento.emit();
    console.log("👋 Cerrando sesión...");
  }

  abrirCarpeta(url: string) {
    if (url) {
      window.open(url, '_blank');
    } else {
      alert("No hay archivo disponible para esta carpeta.");
    }
  }
}