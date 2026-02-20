import { Component, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule], 
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  @Output() cerrarSesionEvento = new EventEmitter<void>();
  
  mensajeServidor = '¡Bóveda Segura conectada!';
  cargandoBoveda: boolean = true; 

  esAdmin: boolean = false;
  tieneAccesoTotal: boolean = false; 
  nombreUsuario: string = '';
  vistaActual: 'boveda' | 'admin' = 'boveda'; 
  listaUsuarios: any[] = []; 

  // ✨ VARIABLES DE NAVEGACIÓN DE CARPETAS
  misCarpetas: any[] = []; // Directorios físicos
  carpetas: any[] = []; // Todos los documentos de la BD
  carpetaActual: any = null; // null = ver carpetas | objeto = ver documentos de esa carpeta
  documentosDeCarpeta: any[] = []; // Los documentos filtrados para la vista actual

  mostrarModalAlta: boolean = false;
  nuevoUsuario = { nombre: '', email: '', password: '', id_rol: 4 };

  mostrarModalUpload: boolean = false;
  subiendo: boolean = false;
  archivoSeleccionado: File | null = null;
  nuevoDoc = { nombre: '', criticidad: 'NORMAL', id_carpeta: '' }; 

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.leerIdentidadUsuario(); 
    this.obtenerDatosCompletos(); // Carga carpetas y documentos de golpe
  }

  leerIdentidadUsuario() {
    const token = localStorage.getItem('token_medicloud');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.nombreUsuario = payload.nombre;
        this.esAdmin = (payload.rol === 3); 
        this.tieneAccesoTotal = (payload.rol === 3 || payload.rol === 1);
      } catch (e) { console.error("Error al leer el token", e); }
    }
  }

  cambiarVista(vista: 'boveda' | 'admin') {
    this.vistaActual = vista;
    if (vista === 'admin') this.obtenerUsuariosAdmin();
    this.cdr.detectChanges();
  }

  // ✨ NUEVO: Carga los directorios y los documentos a la vez
  obtenerDatosCompletos() {
    this.cargandoBoveda = true; 
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    // 1. Obtener los nombres de las carpetas
    this.http.get('https://medicloud-backend-tuug.onrender.com/api/mis-carpetas', { headers }).subscribe({
      next: (resCarpetas: any) => {
        this.misCarpetas = resCarpetas;
        
        // 2. Obtener todos los documentos
        this.http.get('https://medicloud-backend-tuug.onrender.com/api/carpetas', { headers }).subscribe({
          next: (resDocs: any) => {
            this.carpetas = resDocs.carpetas || resDocs;
            this.cargandoBoveda = false; 

            // Si ya estábamos dentro de una carpeta (por ejemplo al subir archivo), refrescamos sus documentos
            if (this.carpetaActual) {
              this.entrarCarpeta(this.carpetaActual);
            }
            this.cdr.detectChanges(); 
          },
          error: (err) => { this.cargandoBoveda = false; }
        });
      },
      error: (err) => { this.cargandoBoveda = false; }
    });
  }

  // ✨ NUEVO: Al hacer clic en una carpeta, filtramos sus documentos
  entrarCarpeta(carpeta: any) {
    this.carpetaActual = carpeta;
    // Filtramos los documentos donde la "ubicacion" coincida con el nombre de la carpeta
    this.documentosDeCarpeta = this.carpetas.filter(doc => doc.ubicacion === carpeta.nombre);
    this.cdr.detectChanges();
  }

  // ✨ NUEVO: Botón de Atrás
  volverACarpetas() {
    this.carpetaActual = null;
    this.documentosDeCarpeta = [];
    this.obtenerDatosCompletos(); // Refrescar por si hubo cambios
    this.cdr.detectChanges();
  }

  buscarCarpeta(termino: string) {
    if (!termino.trim()) {
      this.volverACarpetas(); 
      return;
    }
    this.cargandoBoveda = true;
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get(`https://medicloud-backend-tuug.onrender.com/api/carpetas/buscar?nombre=${termino}`, { headers }).subscribe({
      next: (respuesta: any) => {
        // En búsqueda, mostramos los resultados directamente simulando que es una carpeta especial
        this.carpetaActual = { nombre: `Búsqueda: "${termino}"` };
        this.documentosDeCarpeta = respuesta.carpetas || respuesta;
        this.cargandoBoveda = false;
        this.cdr.detectChanges();
      },
      error: (err) => { this.cargandoBoveda = false; }
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

  abrirModalSubida() {
    this.mostrarModalUpload = true;
    // Si estamos dentro de una carpeta, pre-seleccionarla en el desplegable
    if (this.carpetaActual && this.carpetaActual.id_carpeta) {
      this.nuevoDoc.id_carpeta = this.carpetaActual.id_carpeta;
    } else if (this.misCarpetas.length > 0) {
      this.nuevoDoc.id_carpeta = this.misCarpetas[0].id_carpeta;
    }
  }

  onFileSelected(event: any) {
    this.archivoSeleccionado = event.target.files[0];
  }

  subirArchivo() {
    if (!this.archivoSeleccionado || !this.nuevoDoc.nombre || !this.nuevoDoc.id_carpeta) {
      alert("Por favor, rellena el nombre, selecciona una carpeta y un archivo.");
      return;
    }

    this.subiendo = true;
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    const formData = new FormData();
    formData.append('archivo', this.archivoSeleccionado);
    formData.append('nombre', this.nuevoDoc.nombre);
    formData.append('criticidad', this.nuevoDoc.criticidad);
    formData.append('id_carpeta', this.nuevoDoc.id_carpeta); 

    this.http.post('https://medicloud-backend-tuug.onrender.com/api/carpetas/upload', formData, { headers }).subscribe({
      next: (res: any) => {
        alert("✅ " + res.mensaje);
        this.mostrarModalUpload = false;
        this.subiendo = false;
        this.archivoSeleccionado = null;
        this.nuevoDoc = { nombre: '', criticidad: 'NORMAL', id_carpeta: '' };
        this.obtenerDatosCompletos(); // Refrescar para ver el nuevo archivo
      },
      error: (err) => {
        alert("❌ Error: " + (err.error?.error || "Fallo al conectar con el servidor"));
        this.subiendo = false;
        this.cdr.detectChanges();
      }
    });
  }

  cerrarSesion() {
    localStorage.removeItem('token_medicloud');
    this.cerrarSesionEvento.emit();
  }

  abrirCarpeta(url: string) {
    if (url) window.open(url, '_blank');
    else alert("No hay archivo disponible para esta tarjeta.");
  }

  toggleEstado(usuario: any) {
    const nuevoEstado = usuario.estado === 'Bloqueado' ? 'Activo' : 'Bloqueado';
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.put(`https://medicloud-backend-tuug.onrender.com/api/admin/usuarios/${usuario.id_usuario}/estado`, 
    { nuevoEstado }, { headers }).subscribe({
      next: () => {
        usuario.estado = nuevoEstado;
        this.cdr.detectChanges();
      },
      error: (err) => { alert("❌ Error del Servidor:\n" + (err.error?.error || err.message)); }
    });
  }

  crearUsuario() {
    if (!this.nuevoUsuario.nombre || !this.nuevoUsuario.email || !this.nuevoUsuario.password) return;
    const token = localStorage.getItem('token_medicloud');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.post('https://medicloud-backend-tuug.onrender.com/api/admin/usuarios', this.nuevoUsuario, { headers }).subscribe({
      next: (res: any) => {
        alert(res.mensaje);
        this.mostrarModalAlta = false;
        this.obtenerUsuariosAdmin(); 
        this.nuevoUsuario = { nombre: '', email: '', password: '', id_rol: 4 };
      },
      error: (err) => { alert("❌ Error de Base de Datos:\n" + (err.error?.error || err.message)); }
    });
  }
}