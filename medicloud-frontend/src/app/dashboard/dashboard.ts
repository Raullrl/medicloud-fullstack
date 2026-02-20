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
  
  cargandoBoveda: boolean = true; 

  esAdmin: boolean = false;
  // ✨ NUEVO: Variable para saber si el usuario puede ver todas las carpetas (SysAdmin o Gerencia)
  tieneAccesoTotal: boolean = false; 
  nombreUsuario: string = '';
  vistaActual: 'boveda' | 'admin' = 'boveda'; 
  listaUsuarios: any[] = []; 

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.leerIdentidadUsuario(); 
    this.obtenerCarpetas();
  }

  leerIdentidadUsuario() {
    const token = localStorage.getItem('token_medicloud');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.nombreUsuario = payload.nombre;
        
        // 🛡️ LÓGICA DE SEGURIDAD:
        // SysAdmin (3) ve el botón de administración.
        this.esAdmin = (payload.rol === 3); 
        // SysAdmin (3) y Gerencia (1) tienen acceso a todo el contenido de la bóveda.
        this.tieneAccesoTotal = (payload.rol === 3 || payload.rol === 1);
        
      } catch (e) {
        console.error("Error al leer el token", e);
      }
    }
  }

  cambiarVista(vista: 'boveda' | 'admin') {
    this.vistaActual = vista;
    if (vista === 'admin') {
      this.obtenerUsuariosAdmin();
    }
    this.cdr.detectChanges();
  }

  // ✨ NUEVO: Función que conecta con el backend para buscar sin vulnerabilidad SQLi
  buscarCarpeta(termino: string) {
    if (!termino.trim()) {
      this.obtenerCarpetas(); // Si el buscador está vacío, volvemos a cargar todo
      return;
    }

    this.cargandoBoveda = true;
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get(`https://medicloud-backend-tuug.onrender.com/api/carpetas/buscar?nombre=${termino}`, { headers }).subscribe({
      next: (respuesta: any) => {
        this.carpetas = respuesta.carpetas || respuesta;
        this.cargandoBoveda = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error("❌ Error en búsqueda:", err);
        this.cargandoBoveda = false;
        this.cdr.detectChanges();
      }
    });
  }

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
    this.cargandoBoveda = true; 
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get('https://medicloud-backend-tuug.onrender.com/api/carpetas', { headers }).subscribe({
      next: (respuesta: any) => {
        if (respuesta && respuesta.carpetas) {
          this.carpetas = respuesta.carpetas;
        } else if (Array.isArray(respuesta)) {
          this.carpetas = respuesta;
        }
        this.cargandoBoveda = false; 
        this.cdr.detectChanges(); 
      },
      error: (err) => {
        console.error("❌ Error al obtener carpetas:", err);
        this.cargandoBoveda = false; 
        this.cdr.detectChanges();
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