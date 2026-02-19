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
    console.log("📍 PASO 1: El Dashboard acaba de aparecer en pantalla.");
    this.obtenerCarpetas();
  }

  obtenerCarpetas() {
    console.log("📍 PASO 2: Entrando en la función obtenerCarpetas().");
    
    const token = localStorage.getItem('token_medicloud');
    console.log("📍 PASO 3: ¿Tenemos la llave (token)?:", token ? "SÍ, hay token." : "NO, está vacío.");

    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    console.log("📍 PASO 4: Lanzando el 'cohete' (petición HTTP) hacia Render...");
    
    this.http.get('https://medicloud-backend-tuug.onrender.com/api/carpetas', { headers }).subscribe({
      next: (data: any) => {
        console.log("📍 PASO 5 (ÉXITO): ¡Han llegado los datos de Aiven!", data);
        this.carpetas = data;
      },
      error: (err) => {
        console.error("📍 PASO 5 (ERROR): Render ha rechazado la petición.", err);
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