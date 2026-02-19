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

  // ✨ AÑADIDO: Variables para el control de roles y el panel de administrador
  esAdmin: boolean = false;
  nombreUsuario: string = '';
  vistaActual: 'boveda' | 'admin' = 'boveda'; // Controla qué pantalla vemos
  listaUsuarios: any[] = []; // Guardará la lista de empleados

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.leerIdentidadUsuario(); // ✨ AÑADIDO: Desciframos el token al entrar
    this.obtenerCarpetas();
  }

  // ✨ AÑADIDO: Función que lee el Token JWT para saber tu rol
  leerIdentidadUsuario() {
    const token = localStorage.getItem('token_medicloud');
    if (token) {
      try {
        // Desempaquetamos el payload del Token JWT
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.nombreUsuario = payload.nombre;
        // Asumimos que el rol 1 es el Administrador (ajústalo si en tu BD es otro número)
        this.esAdmin = (payload.rol === 1); 
      } catch (e) {
        console.error("Error al leer el token", e);
      }
    }
  }

  // ✨ AÑADIDO: Función para cambiar entre la Bóveda y el Panel Admin
  cambiarVista(vista: 'boveda' | 'admin') {
    this.vistaActual = vista;
    if (vista === 'admin') {
      this.obtenerUsuariosAdmin();
    }
    this.cdr.detectChanges();
  }

  // ✨ AÑADIDO: Función que pide al backend la lista de empleados (CRUD)
  obtenerUsuariosAdmin() {
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get('https://medicloud-backend-tuug.onrender.com/api/admin/usuarios', { headers }).subscribe({
      next: (respuesta: any) => {
        this.listaUsuarios = respuesta.usuarios || respuesta;
        this.cdr.detectChanges();
      },
      error: (err) => {
        alert("⛔ Acceso denegado. No tienes permisos de Administrador.");
        this.cambiarVista('boveda');
      }
    });
  }

  obtenerCarpetas() {
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get('https://medicloud-backend-tuug.onrender.com/api/carpetas', { headers }).subscribe({
      next: (respuesta: any) => {
        if (respuesta && respuesta.carpetas) {
          this.carpetas = respuesta.carpetas;
        } else if (Array.isArray(respuesta)) {
          this.carpetas = respuesta;
        }
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