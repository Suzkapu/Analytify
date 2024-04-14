import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from "@angular/common/http";
import {environment} from "../../../environments/environment.development";

@Injectable({
  providedIn: 'root'
})
export class BackendService {

  constructor(private http: HttpClient) {
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, PUT, OPTIONS, HEAD',
      'Access-Control-Allow-Origin': '*'
    });
  }

  getAllTags() {
    return this.http.get(environment.backendUrl + 'tag/getAll')
  }

  getAllTagsFromTrack(id: number) {
    return this.http.get(environment.backendUrl + 'track/' + id + '/getAllTags/')
  }

  addTagToTrack(id: number, tag: string, trackName: string, trackUrl: string) {
    const existingHeaders = this.getHeaders();

    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    const body = {
      trackName: trackName,
      trackUrl: trackUrl
    };

    return this.http.post(environment.backendUrl + 'track/' + id + '/addTag/' + tag, body, { headers: headers });
  }


  getAllTracksFromTag(id: number) {
    return this.http.get(environment.backendUrl + 'tag/' + id + '/getAllTracks')
  }

  createNewTag(name: string) {
    return this.http.post(environment.backendUrl + 'tag/create/' + name, {
      headers: this.getHeaders()
    })
  }

  deleteTag(id: number) {
    return this.http.delete(environment.backendUrl + 'tag/' + id + '/delete', {
      headers: this.getHeaders()
    })
  }
}
