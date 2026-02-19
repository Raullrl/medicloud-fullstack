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
  // El "altavoz" para avisar a app.ts
  @Output() cerrarSesionEvento = new EventEmitter<void>();
  
  carpetas: any[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.obtenerCarpetas();
  }

  obtenerCarpetas() {
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    // URL corregida con 'tuug'
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
    // 1. Limpiamos el token por seguridad
    localStorage.removeItem('token_medicloud');
    
    // 2. Avisamos al componente padre
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


